import { eventSchema } from '../../../world/schema.js';
import { createState } from '../../../world/state.js';

/**
 * Optional `world_state` on the character-agent chat POST, plus the leader's
 * first-message warmth for the current Asia/Seoul day.
 *
 * The agent request is the character's `agent.chat` on `agent.upstream`
 * (today `POST /api/kin/chat` and `POST /api/dred/chat`). mirrored-api reads
 * `world_state` and drops a missing or invalid value, so the reply still
 * streams. Unknown keys are ignored there. This object is only:
 *
 *   energy, energy_max, mood, level, pending_warmth  finite numbers
 *   recent_warmth                                     finite number, omitted
 *                                                     when the snapshot has
 *                                                     no log to scan
 *   daily_chat_bonus_granted_now                      boolean
 *
 * No visitor ids, addresses, or secrets.
 *
 * The warmth row is the same write as POST /api/world/signal: `store.append`
 * → `world_append_event`, `what: "influence"`, `kind: "warmth"`. Amount is
 * min(2, maxInfluencePerEvent). `source` stays `visitor-influence` because
 * world/step.js applies only that source; a different source would be stored
 * and then dropped on the next tick. The row is distinguishable by
 * `payload.grant: "ben-chat-daily"` and by its id,
 * `ben-chat-daily:<world>:<slug>:<YYYY-MM-DD>`. The primary key makes a
 * retry a no-op. `who` is the leader slug. No address hash is stored.
 * The public signal route only accepts amount 1, so this does not go
 * through that HTTP body.
 */

const SEOUL = 'Asia/Seoul';
const DAY_MS = 24 * 60 * 60 * 1000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID = /^[A-Za-z0-9:._-]{1,180}$/;
export const DAILY_CHAT_GRANT = 'ben-chat-daily';
const DAILY_CHAT_WARMTH = 2;
const NUMBER_KEYS = ['energy', 'energy_max', 'mood', 'level', 'pending_warmth'];

export function kstDateKey(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const key = `${pick('year')}-${pick('month')}-${pick('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

export function dailyGrantId(worldId, slug, now) {
  const key = kstDateKey(now);
  if (!key || !SLUG.test(worldId) || !SLUG.test(slug)) return '';
  const id = `${DAILY_CHAT_GRANT}:${worldId}:${slug}:${key}`;
  return EVENT_ID.test(id) ? id : '';
}

export function dailyGrantEvent({ id, worldId, slug, leaderSlug, amount, now }) {
  return {
    id,
    worldId,
    tick: null,
    at: now.toISOString(),
    who: leaderSlug,
    what: 'influence',
    where: null,
    target: slug,
    payload: { kind: 'warmth', amount, grant: DAILY_CHAT_GRANT },
    source: 'visitor-influence',
  };
}

/** Copy only the agent contract. Anything else, including a visitor id, is dropped. */
export function sealWorldState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of NUMBER_KEYS) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) return null;
    out[key] = value[key];
  }
  if (typeof value.daily_chat_bonus_granted_now !== 'boolean') return null;
  out.daily_chat_bonus_granted_now = value.daily_chat_bonus_granted_now;
  if (Object.hasOwn(value, 'recent_warmth')) {
    if (typeof value.recent_warmth !== 'number' || !Number.isFinite(value.recent_warmth)) {
      return null;
    }
    out.recent_warmth = value.recent_warmth;
  }
  return out;
}

export async function perceiveChat(input) {
  try {
    if (!input?.store || !input?.canon?.world?.id || typeof input.slug !== 'string') {
      return { vitals: {}, worldState: null };
    }
    if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
      return { vitals: {}, worldState: null };
    }
    return await perceive(input);
  } catch {
    return { vitals: {}, worldState: null };
  }
}

async function perceive(input) {
  const row = await input.store.latest(input.canon.world.id);
  const usable = usableState(row?.state, input.canon);
  if (row && !usable) return { vitals: numbersOf(row.state), worldState: null };
  const state = usable ? row.state : createState(input.canon);
  const character = state.characters?.[input.slug];
  const vitals = numbersOf(character);
  try {
    const worldState = await assemble({ ...input, row, state, character });
    return { vitals, worldState };
  } catch {
    return { vitals, worldState: null };
  }
}

async function assemble(input) {
  const { store, canon, state, character, slug, now, leader } = input;
  if (!character || typeof character !== 'object') return null;
  const rules = rulesOf(state, canon);
  const amount = dailyAmount(rules?.maxInfluencePerEvent);
  const energyMax = rules?.energyMax;
  if (!Number.isInteger(energyMax) || !Number.isFinite(character.energy)) return null;
  if (!Number.isFinite(character.mood) || !Number.isFinite(character.level)) return null;

  const active = character.status === 'active';
  const leaderSlug = leaderSlugOf(state, canon);
  const id = dailyGrantId(state.worldId, slug, now);
  const afterSeq = cursorOf(input.row);
  const [existing, pending] = await Promise.all([
    id ? store.findEvent(id) : Promise.resolve(null),
    store.listPendingInfluence(state.worldId, slug, afterSeq),
  ]);
  const rows = Array.isArray(pending)
    ? pending.filter((row) => row && typeof row === 'object')
    : [];

  let grantedNow = false;
  if (
    leader === true &&
    active &&
    amount &&
    id &&
    leaderSlug &&
    !grantedAlready(existing, rows, id, now)
  ) {
    const event = dailyGrantEvent({
      id,
      worldId: state.worldId,
      slug,
      leaderSlug,
      amount,
      now,
    });
    const parsed = eventSchema.safeParse(event);
    if (parsed.success) {
      try {
        const saved = await store.append(parsed.data);
        if (saved?.ok === true) {
          grantedNow = saved.duplicate !== true;
          if (!rows.some((row) => row.id === id)) rows.push(parsed.data);
        }
      } catch {
        grantedNow = false;
      }
    }
  } else if (existing && Number(existing.seq) > afterSeq && !rows.some((row) => row.id === id)) {
    rows.push(existing);
  }

  const pendingWarmth = active ? sumWarmth(rows, rules.maxInfluencePerEvent, slug) : 0;
  const recent = recentWarmth(input.row, state, slug, now, rules.maxInfluencePerEvent);
  const draft = {
    energy: character.energy,
    energy_max: energyMax,
    mood: character.mood,
    level: character.level,
    pending_warmth: pendingWarmth,
    daily_chat_bonus_granted_now: grantedNow,
  };
  if (typeof recent === 'number') draft.recent_warmth = recent;
  return sealWorldState(draft);
}

function grantedAlready(existing, rows, id, now) {
  if (existing) return true;
  const key = kstDateKey(now);
  if (!key) return false;
  return rows.some((row) => {
    if (row.id === id) return true;
    if (row.payload?.grant !== DAILY_CHAT_GRANT) return false;
    const at = new Date(row.at);
    return !Number.isNaN(at.getTime()) && kstDateKey(at) === key;
  });
}

function recentWarmth(snapshot, state, slug, now, max) {
  if (!snapshot) return 0;
  if (!Array.isArray(state?.log)) return undefined;
  const cutoff = now.getTime() - DAY_MS;
  const ceiling = now.getTime() + 60_000;
  const seen = new Set();
  let sum = 0;
  for (const entry of state.log) {
    if (!entry || seen.has(entry.id) || entry.what !== 'influence') continue;
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at) || at < cutoff || at > ceiling) continue;
    seen.add(entry.id);
    sum += acceptedWarmth(entry, max, slug);
  }
  return sum;
}

function sumWarmth(rows, max, target) {
  const seen = new Set();
  let sum = 0;
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    sum += acceptedWarmth(row, max, target);
  }
  return sum;
}

function acceptedWarmth(event, max, target) {
  if (!event || event.what !== 'influence' || event.target !== target) return 0;
  if (event.source !== 'visitor-influence') return 0;
  const payload = event.payload;
  if (!payload || payload.kind !== 'warmth') return 0;
  const amount = payload.amount == null ? 1 : payload.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isInteger(max) || amount > max) return 0;
  return amount;
}

function dailyAmount(max) {
  if (!Number.isInteger(max) || max < 1) return null;
  return Math.min(DAILY_CHAT_WARMTH, max);
}

function rulesOf(state, canon) {
  if (usableRules(state?.rules)) return state.rules;
  if (usableRules(canon?.world?.rules)) return canon.world.rules;
  return null;
}

function usableRules(rules) {
  return (
    rules &&
    Number.isInteger(rules.energyMax) &&
    rules.energyMax > 0 &&
    Number.isInteger(rules.maxInfluencePerEvent) &&
    rules.maxInfluencePerEvent >= 1
  );
}

function usableState(state, canon) {
  return Boolean(
    state &&
    typeof state === 'object' &&
    !Array.isArray(state) &&
    state.worldId === canon.world.id &&
    state.characters &&
    typeof state.characters === 'object'
  );
}

function cursorOf(row) {
  const seq = Number(row?.last_event_seq);
  if (!Number.isInteger(seq) || seq < 0) return 0;
  return seq;
}

function leaderSlugOf(state, canon) {
  if (typeof state?.leaderSlug === 'string' && SLUG.test(state.leaderSlug)) return state.leaderSlug;
  const leader = (canon?.entities ?? []).find(
    (entity) => entity?.kind === 'leader' && entity.status !== 'draft' && SLUG.test(entity.slug)
  );
  return leader?.slug ?? '';
}

function numbersOf(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  if (typeof value.energy === 'number' && Number.isFinite(value.energy)) out.energy = value.energy;
  if (typeof value.mood === 'number' && Number.isFinite(value.mood)) out.mood = value.mood;
  return out;
}
