import { CHAT_MAX_MESSAGES, CHAT_MAX_TEXT, clampChatText } from './chat-compose.js';
import { isReplyId, normalizeReply } from './chat-reply.js';

const SESSION = /^[a-zA-Z0-9-]{1,64}$/;

export function threadStorageKey(slug) {
  return `call:${slug}:thread`;
}

/** Previous tab-scoped id. Moved into the thread record on the next visit. */
export function legacySessionKey(slug) {
  return `call:${slug}`;
}

export function isSessionId(value) {
  return typeof value === 'string' && SESSION.test(value);
}

export function openStorage(name, scope = globalThis) {
  try {
    const store = scope[name];
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
      return null;
    }
    return store;
  } catch {
    return null;
  }
}

/**
 * Last 24 turns, same window as `clampHistory`. Ids, times, and quotes stay
 * so the log can redraw. Anything else on a message is dropped.
 */
export function threadRecord({ sessionId = '', messages = [], at } = {}) {
  const kept = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    if (typeof message.content !== 'string') continue;
    const content = clampChatText(message.content, CHAT_MAX_TEXT);
    if (!content) continue;
    const row = { role: message.role, content };
    if (isReplyId(message.id)) row.id = message.id;
    if (typeof message.at === 'string' && Number.isFinite(Date.parse(message.at))) {
      row.at = new Date(message.at).toISOString();
    }
    const reply = normalizeReply(
      message.reply_to && typeof message.reply_to === 'object'
        ? { id: message.reply_to.id, excerpt: message.reply_to.excerpt }
        : null
    );
    if (reply) row.reply_to = reply;
    kept.push(row);
  }
  const stamp =
    typeof at === 'string' && Number.isFinite(Date.parse(at))
      ? new Date(at).toISOString()
      : new Date().toISOString();
  return {
    sessionId: isSessionId(sessionId) ? sessionId : '',
    messages: kept.slice(-CHAT_MAX_MESSAGES),
    at: stamp,
  };
}

export function parseThread(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return threadRecord(value);
}

export function threadShowsIdle(thread) {
  return !thread || !Array.isArray(thread.messages) || thread.messages.length === 0;
}

export function saveThread(store, slug, record) {
  const next = threadRecord(record);
  if (!store) return next;
  try {
    store.setItem(threadStorageKey(slug), JSON.stringify(next));
  } catch {
    /* quota or a locked store */
  }
  return next;
}

function dropLegacy(store, key) {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Read `{sessionId, messages, at}` from localStorage. A sessionStorage id is
 * copied over when the thread does not already have one, then removed.
 */
export function loadThread(local, session, slug) {
  const legacyKey = legacySessionKey(slug);
  let record = null;
  try {
    record = parseThread(local?.getItem(threadStorageKey(slug)) || '');
  } catch {
    record = null;
  }
  let legacyId = '';
  try {
    const raw = session?.getItem(legacyKey) || '';
    if (isSessionId(raw)) legacyId = raw;
  } catch {
    legacyId = '';
  }
  if (!record && !legacyId) return { sessionId: '', messages: [], at: '' };
  if (!record?.sessionId && legacyId) {
    const migrated = saveThread(local, slug, {
      sessionId: legacyId,
      messages: record?.messages || [],
      at: record?.at || new Date().toISOString(),
    });
    let persisted = false;
    try {
      persisted = parseThread(local?.getItem(threadStorageKey(slug)) || '')?.sessionId === legacyId;
    } catch {
      persisted = false;
    }
    if (persisted) dropLegacy(session, legacyKey);
    return migrated;
  }
  if (legacyId) dropLegacy(session, legacyKey);
  return record;
}

export function clearStoredThread(local, session, slug) {
  try {
    local?.removeItem(threadStorageKey(slug));
  } catch {
    /* ignore */
  }
  dropLegacy(session, legacySessionKey(slug));
}
