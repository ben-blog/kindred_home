/**
 * Outbound chat text for the leader call.
 *
 * The chat route (`src/lib/world/chat.js`) rejects a user message longer than
 * 2000 characters, a history longer than 24 messages, and more than 20 posts
 * per minute. Queued lines are joined into one user message so one reply can
 * answer them, and a join that would exceed 2000 stays in the queue.
 */

export const CHAT_MAX_TEXT = 2000;
export const CHAT_MAX_MESSAGES = 24;

const ZWJ = '\u200D';

let segmenter;

function graphemes(text) {
  if (!segmenter) segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(text)];
}

function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** A grapheme the next token may still extend: ZWJ, half a pair, a flag, a keycap. */
export function isIncompleteGrapheme(grapheme) {
  if (typeof grapheme !== 'string' || !grapheme) return false;
  if (grapheme.endsWith(ZWJ)) return true;
  if (hasUnpairedSurrogate(grapheme)) return true;
  if (/^\uD83C[\uDDE6-\uDDFF]$/.test(grapheme)) return true;
  if (/^[#*0-9]\uFE0F$/.test(grapheme)) return true;
  return false;
}

/**
 * Prefix that is safe to paint. The trailing incomplete cluster stays buffered
 * so a token boundary cannot flash a split surrogate or a half ZWJ sequence.
 */
export function stablePrefix(text) {
  if (typeof text !== 'string' || !text) return '';
  const parts = graphemes(text);
  if (!parts.length) return text;
  const last = parts[parts.length - 1];
  if (!isIncompleteGrapheme(last.segment)) return text;
  return text.slice(0, last.index);
}

export function splitText(text, maxLen = CHAT_MAX_TEXT) {
  if (typeof text !== 'string' || !text) return [];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let current = '';
  for (const part of graphemes(text)) {
    const piece = part.segment;
    if (piece.length > maxLen) {
      if (current) chunks.push(current);
      current = '';
      for (let index = 0; index < piece.length; index += maxLen) {
        chunks.push(piece.slice(index, index + maxLen));
      }
      continue;
    }
    if (current.length + piece.length > maxLen) {
      chunks.push(current);
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Take a prefix of `pending` whose texts join with newlines within `maxLen`.
 * Items stay in order. A single over-long text is split so the route can accept it.
 */
export function takeBatch(pending, maxLen = CHAT_MAX_TEXT) {
  const batch = [];
  let length = 0;
  while (pending.length) {
    const next = pending[0];
    const text = typeof next?.text === 'string' ? next.text : '';
    if (!text) {
      pending.shift();
      continue;
    }
    if (text.length > maxLen) {
      const [head, ...rest] = splitText(text, maxLen);
      next.text = head;
      pending.shift();
      batch.push(next);
      for (let index = rest.length - 1; index >= 0; index -= 1) {
        pending.unshift({ text: rest[index], row: null, silent: true });
      }
      break;
    }
    const addition = batch.length === 0 ? text.length : text.length + 1;
    if (batch.length > 0 && length + addition > maxLen) break;
    pending.shift();
    batch.push(next);
    length += addition;
  }
  return batch;
}

export function joinBatch(batch) {
  return batch.map((item) => item.text).join('\n');
}

/** Retry-After seconds, or an HTTP date. Unknown values wait a minute, capped at two. */
export function retryDelayMs(header, now = Date.now()) {
  const fallback = 60_000;
  const cap = 120_000;
  if (typeof header !== 'string' || !header.trim()) return fallback;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, cap);
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - now), cap);
  return fallback;
}

/**
 * Insert at the caret. A live IME composition is left untouched.
 * `maxLength` on the field is the same cap the route enforces.
 */
export function insertAtCaret(input, insert, { composing = false, start, end } = {}) {
  if (composing || typeof insert !== 'string' || !insert) return false;
  const value = typeof input.value === 'string' ? input.value : '';
  const from = Number.isInteger(start) ? start : (input.selectionStart ?? value.length);
  const to = Number.isInteger(end) ? end : (input.selectionEnd ?? from);
  const limit = input.maxLength > 0 ? input.maxLength : CHAT_MAX_TEXT;
  if (value.length - (to - from) + insert.length > limit) return false;
  if (typeof input.setRangeText === 'function') {
    input.setRangeText(insert, from, to, 'end');
  } else {
    input.value = value.slice(0, from) + insert + value.slice(to);
    input.selectionStart = from + insert.length;
    input.selectionEnd = from + insert.length;
  }
  return true;
}

export function createSseReader() {
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (part) => {
    const row = part.split('\n').find((item) => item.startsWith('data:'));
    if (!row) return null;
    try {
      return JSON.parse(row.slice(5).trim());
    } catch {
      return null;
    }
  };

  return {
    push(bytes) {
      buffer += decoder.decode(bytes, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      return parts.map(parse).filter(Boolean);
    },
    flush() {
      buffer += decoder.decode();
      if (!buffer.trim()) {
        buffer = '';
        return [];
      }
      const parts = buffer.split('\n\n');
      buffer = '';
      return parts.map(parse).filter(Boolean);
    },
  };
}

/** Mood groups for the call picker. Kept inline so the page does not load an emoji library. */
export const EMOJI_GROUPS = [
  { id: 'joy', emoji: ['😊', '😄', '😁', '🥰', '😂', '✨'] },
  { id: 'playful', emoji: ['😜', '🤗', '🎉', '👀', '🍀', '🎈'] },
  { id: 'calm', emoji: ['😌', '🌙', '☁️', '🌿', '☕', '🤍'] },
  { id: 'shy', emoji: ['😳', '🙈', '🥺', '☺️', '💕', '🫶'] },
  { id: 'sad', emoji: ['😢', '😔', '💔', '🌧️', '😞', '🫂'] },
  { id: 'intense', emoji: ['🔥', '⚡', '😈', '🖤', '💥', '😤'] },
  { id: 'tired', emoji: ['😴', '🥱', '💤', '😮‍💨', '🫠', '🛌'] },
];
