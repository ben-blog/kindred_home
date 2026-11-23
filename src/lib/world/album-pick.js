import { eventSchema } from '../../../world/schema.js';
import { kstDateKey } from './perception.js';
import { voiceFor } from './album-voice.js';
import { publicImages } from './gallery-feed.js';

/**
 * One Seoul-day album pick for a void character.
 *
 * `world_events.what` only allows influence, agent_action, external, and tick.
 * A new kind would be a schema change, so the pick is an `agent_action` note
 * (`source: "agent"`, `payload.kind: "dred_album_pick"`). The claim row uses
 * a different source so `step` ignores it. Neither row changes stats.
 * The id is the primary key, so a second insert the same day is a no-op.
 */

const KIND = 'dred_album_pick';
const CLAIM_SOURCE = 'album-pick';
const CLAIM_FRESH_MS = 20_000;
const DEFAULT_WAIT_MS = CLAIM_FRESH_MS;
const PROMPT_LIMIT = 7000;
const LINE_LIMIT = 80;

const flights = new Map();
const ready = new Map();

export function resetAlbumPicks() {
  flights.clear();
  ready.clear();
}

export function albumPickId(worldId, slug, date) {
  return `album-pick:${worldId}:${slug}:${date}`;
}

export function albumClaimId(worldId, slug, date) {
  return `album-pick:${worldId}:${slug}:${date}:claim`;
}

export function hash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Same three ids for every caller on a given Seoul date. */
export function seededIds(ids, date, count = 3) {
  const seen = new Set();
  const unique = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  const take = Math.min(count, unique.length);
  if (unique.length <= count) return unique.slice();
  return unique
    .map((id) => ({ id, rank: hash32(`${date}:${id}`) }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, take)
    .map((item) => item.id);
}

export function albumCandidates(staticDoc, rows) {
  const images = [];
  const seen = new Set();
  const push = (image) => {
    if (!image || image.is_active === false || !image.id || !image.filename) return;
    const id = String(image.id);
    const file = `file:${image.filename}`;
    if (seen.has(id) || seen.has(file)) return;
    seen.add(id);
    seen.add(file);
    const ko = image.ko || {};
    const en = image.en || {};
    images.push({
      id,
      filename: image.filename,
      order: Number.isInteger(image.order_num) ? image.order_num : 0,
      title: text(ko.title) || text(en.title),
      perspective: text(ko.dred_perspective) || text(en.dred_perspective),
    });
  };
  for (const image of Array.isArray(staticDoc?.images) ? staticDoc.images : []) push(image);
  for (const image of publicImages(staticDoc, rows, new Map(), new Map())) {
    push({
      id: image.id,
      filename: image.filename,
      order_num: image.order_num,
      is_active: true,
      ko: image.ko,
      en: image.en,
    });
  }
  images.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return images;
}

export function perspectiveLine(value) {
  const line = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return '';
  const sentence = line.split(/(?<=[.。…])\s/)[0] || line;
  return sentence.length > LINE_LIMIT ? sentence.slice(0, LINE_LIMIT).trim() : sentence;
}

export function fallbackPick(items, date, voice) {
  const list = Array.isArray(items) ? items : [];
  const item_ids = seededIds(
    list.map((item) => item.id),
    date || ''
  );
  const chosen = list.find((item) => item.id === item_ids[0]);
  const fromPicture = perspectiveLine(chosen?.perspective);
  const sample = perspectiveLine(voice?.sample);
  const line = hangul(fromPicture) ? fromPicture : hangul(sample) ? sample : '…알아.';
  return { item_ids, line };
}

export function buildPrompt(items, voice, date) {
  const tone = voice?.tone ? `Voice: ${voice.tone}` : '';
  const sample = voice?.sample ? `A line you would say: ${voice.sample}` : '';
  const head = [
    `Today is ${date} in Asia/Seoul. Choose 3 stills and write one line.`,
    tone,
    sample,
    'The line is Korean, banmal, one sentence, no question, no honorific, no explanation.',
    'Return one JSON object and nothing else:',
    '{"item_ids":["id","id","id"],"line":"..."}',
    'item_ids must be exactly 3 ids from this list.',
    'id | title | your perspective',
  ]
    .filter(Boolean)
    .join('\n');
  let perspectiveCap = 80;
  let body = '';
  while (perspectiveCap >= 0) {
    body = items
      .map((item) => {
        const title = clip(item.title, 48);
        const perspective = perspectiveCap ? clip(item.perspective, perspectiveCap) : '';
        return perspective ? `- ${item.id} | ${title} | ${perspective}` : `- ${item.id} | ${title}`;
      })
      .join('\n');
    if (head.length + 1 + body.length <= PROMPT_LIMIT) break;
    perspectiveCap -= 20;
  }
  return `${head}\n${body}`;
}

export function collectReply(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  if (!raw.includes('data:')) return raw;
  let text = '';
  for (const block of raw.split(/\n\n/)) {
    const line = block
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith('data:'));
    if (!line) continue;
    let data;
    try {
      data = JSON.parse(line.slice(line.indexOf(':') + 1).trim());
    } catch {
      continue;
    }
    if (data?.type === 'token' && typeof data.text === 'string') text += data.text;
  }
  return text || raw;
}

export function parseChoice(value, allowed, date) {
  let data = value;
  if (typeof value === 'string') {
    const text = collectReply(value);
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.kind && data.kind !== KIND) return null;
  if (data.phase === 'claim') return null;
  if (date && data.date && data.date !== date) return null;
  const expect = Math.min(3, allowed.size);
  if (!expect || !Array.isArray(data.item_ids) || data.item_ids.length !== expect) return null;
  const ids = data.item_ids.map((id) => (typeof id === 'string' ? id : ''));
  if (ids.some((id) => !id || !allowed.has(id))) return null;
  if (new Set(ids).size !== ids.length) return null;
  const line = cleanLine(data.line);
  if (!line) return null;
  return { item_ids: ids, line };
}

export async function askDredPick({
  origin,
  token,
  path,
  worldState,
  prompt,
  date,
  fetchImpl,
  timeoutMs = 12_000,
}) {
  const sessionId = `album-${date}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const body = {
    messages: [{ role: 'user', content: prompt }],
    sessionId: sessionId || 'album-pick',
  };
  if (worldState) body.world_state = worldState;
  const response = await fetchImpl(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      accept: 'text/event-stream, application/json',
      authorization: `Bearer ${token}`,
      'x-admin-key': token,
    },
    body: JSON.stringify(body),
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  if (!response.ok) return '';
  return collectReply(raw);
}

/**
 * Read today's pick or create it once. `ask` runs only for the claim winner,
 * and only when no row exists yet. A failed or invalid reply is stored as the
 * date-seeded fallback so a later visitor does not call the agent again.
 */
export async function ensureAlbumPick(input) {
  const date = kstDateKey(input.now);
  const id = date ? albumPickId(input.worldId, input.slug, date) : '';
  if (id && ready.has(id)) return ready.get(id);
  let flight = id ? flights.get(id) : null;
  if (!flight) {
    flight = runEnsure(input, date, id).finally(() => {
      if (id) flights.delete(id);
    });
    if (id) flights.set(id, flight);
  }
  return flight;
}

async function runEnsure(input, date, id) {
  try {
    return await createPick(input, date, id);
  } catch {
    return {
      date: date || '',
      ...fallbackPick(input.items, date, input.voice),
      source: 'fallback',
      stored: false,
    };
  }
}

async function createPick(input, date, id) {
  const items = Array.isArray(input.items) ? input.items : [];
  const voice = input.voice || voiceFor(input.slug);
  const allowed = new Set(items.map((item) => item.id));
  const fallback = () => ({
    ...fallbackPick(items, date, voice),
    source: 'fallback',
    stored: false,
  });
  if (!date || !id || !input.store) return fallback();

  const stored = await readStored(input.store, id, allowed, date);
  if (stored) {
    ready.set(id, stored);
    return stored;
  }

  const claimId = albumClaimId(input.worldId, input.slug, date);
  const claimed = await input.store.append(
    noteEvent({
      id: claimId,
      worldId: input.worldId,
      slug: input.slug,
      at: input.now.toISOString(),
      source: CLAIM_SOURCE,
      payload: { action: 'note', kind: KIND, phase: 'claim', date },
    })
  );
  if (!claimed?.ok) return fallback();
  if (claimed.duplicate) {
    const found = await waitForStored(input, id, allowed, date);
    if (found) {
      ready.set(id, found);
      return found;
    }
    const winner = await readStored(input.store, id, allowed, date);
    if (winner) {
      ready.set(id, winner);
      return winner;
    }
    return finish(input, id, date, fallbackPick(items, date, voice), 'fallback', allowed);
  }

  let worldState = null;
  if (typeof input.loadWorld === 'function') {
    try {
      worldState = await input.loadWorld();
    } catch {
      worldState = null;
    }
  }
  let reply = '';
  if (typeof input.ask === 'function') {
    try {
      reply = await input.ask({
        prompt: buildPrompt(items, voice, date),
        worldState,
        date,
      });
    } catch {
      reply = '';
    }
  }
  const parsed = typeof reply === 'string' ? parseChoice(reply, allowed, date) : null;
  const choice = parsed || fallbackPick(items, date, voice);
  return finish(input, id, date, choice, parsed ? 'agent' : 'fallback', allowed);
}

async function finish(input, id, date, choice, source, allowed) {
  const saved = await input.store.append(
    noteEvent({
      id,
      worldId: input.worldId,
      slug: input.slug,
      at: input.now.toISOString(),
      source: 'agent',
      payload: {
        action: 'note',
        kind: KIND,
        date,
        item_ids: choice.item_ids,
        line: choice.line,
        origin: source,
      },
    })
  );
  if (saved?.duplicate) {
    const winner = await readStored(input.store, id, allowed, date);
    if (winner) {
      ready.set(id, winner);
      return winner;
    }
  }
  const pick = {
    date,
    item_ids: choice.item_ids,
    line: choice.line,
    source,
    stored: saved?.ok === true,
  };
  if (pick.stored) ready.set(id, pick);
  return pick;
}

async function waitForStored(input, id, allowed, date) {
  const waitMs = Number.isFinite(input.waitMs) ? input.waitMs : DEFAULT_WAIT_MS;
  const pause = typeof input.sleep === 'function' ? input.sleep : sleep;
  const step = waitMs > 0 ? 250 : 0;
  const rounds = step ? Math.ceil(waitMs / step) : 1;
  for (let i = 0; i < rounds; i += 1) {
    const found = await readStored(input.store, id, allowed, date);
    if (found) return found;
    if (step) await pause(step);
  }
  return null;
}

async function readStored(store, id, allowed, date) {
  const row = await store.findEvent(id);
  const choice = parseChoice(row?.payload, allowed, date);
  if (!choice) return null;
  const source = row.payload.origin === 'agent' ? 'agent' : 'fallback';
  return { date, ...choice, source, stored: true };
}

function noteEvent({ id, worldId, slug, at, source, payload }) {
  const event = {
    id,
    worldId,
    tick: null,
    at,
    who: slug,
    what: 'agent_action',
    where: null,
    target: slug,
    payload,
    source,
  };
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) throw new Error('pick');
  return parsed.data;
}

function cleanLine(value) {
  if (typeof value !== 'string') return '';
  const line = value.replace(/\s+/g, ' ').trim();
  if (!line || line.length > LINE_LIMIT) return '';
  if (/[?？]/.test(line) || /https?:/i.test(line)) return '';
  if (!hangul(line)) return '';
  return line;
}

function hangul(value) {
  return typeof value === 'string' && /[가-힣]/.test(value);
}

function clip(value, max) {
  const textValue = text(value);
  return textValue.length > max ? textValue.slice(0, max).trim() : textValue;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
