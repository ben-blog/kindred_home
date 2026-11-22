export const USER_AGENT = 'kinxdred-world/1.0 (https://kinxdred.com)';
export const RELEASE_WINDOW_DAYS = 14;
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_UPSTREAM_BYTES = 256 * 1024;

const BANNED_KEYS = new Set(['lyrics', 'lyric', 'body', 'text', 'html', 'description', 'synopsis']);

/** Keep a small public payload. Lyric bodies and long copy never pass. */
export function cleanPayload(payload) {
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (BANNED_KEYS.has(String(key).toLowerCase())) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      clean[key] = trimmed.slice(0, 180);
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
  }
  return clean;
}

export function externalId(sourceId, kind, key) {
  return `${sourceId}:${kind}:${key}`.slice(0, 180);
}

export function baseEvent(source, kind, key, payload) {
  const event = {
    id: externalId(source.id, kind, key),
    who: `source:${source.id}`,
    what: 'external',
    payload,
  };
  if (source.scope === 'character' && source.character) event.target = source.character;
  return event;
}

export function daysAgo(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function ymd(date) {
  return date.toISOString().slice(0, 10);
}

export function fuzzyDate(date) {
  return Number(ymd(date).replaceAll('-', ''));
}

export async function readUpstream(response) {
  if (!response?.ok) {
    await response?.body?.cancel().catch(() => {});
    throw new Error('upstream');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_UPSTREAM_BYTES) throw new Error('upstream');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text);
}
