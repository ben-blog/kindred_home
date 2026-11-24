/**
 * Outbound chat text for the leader call.
 *
 * The chat route clamps earlier turns to 2000 characters and keeps the last
 * 24. It rejects only the newest user message when that line is empty or
 * longer than 2000. Queued lines are joined into one user message so one
 * reply can answer them, and a join that would exceed 2000 stays in the queue.
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
    // Each quote belongs to one outgoing turn; never merge it with another line.
    if (batch.length && (batch[0].reply_to || next?.reply_to)) break;
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

/** Trim to the route cap without ending on a lone surrogate. */
export function clampChatText(value, maxLen = CHAT_MAX_TEXT) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.length <= maxLen) return text;
  let end = maxLen;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/**
 * History sent with the next line. Over-long turns are cut, empty turns are
 * left out, and only the last `maxMessages` remain. The newest user line is
 * included when it is already within the cap.
 */
export function clampHistory(messages, maxMessages = CHAT_MAX_MESSAGES, maxLen = CHAT_MAX_TEXT) {
  if (!Array.isArray(messages)) return [];
  const clamped = [];
  for (const message of messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    if (typeof message.content !== 'string') continue;
    const content = clampChatText(message.content, maxLen);
    if (!content) continue;
    clamped.push({ role: message.role, content });
  }
  return clamped.slice(-maxMessages);
}

/**
 * Which short status line to show. `reason` is `network`, `stream`, or
 * `empty`. A numeric `status` covers the HTTP response.
 */
export function explainFailure({ status, reason } = {}) {
  if (reason === 'network') return 'dropped';
  if (reason === 'stream') return 'unanswered';
  if (reason === 'empty') return 'quiet';
  if (status === 400 || status === 413) return 'rejected';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'wait';
  if (typeof status === 'number' && status >= 500) return 'unavailable';
  return 'dropped';
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

export function settleChatStream({ reply, completed = false, media = null, error = null }) {
  const text = typeof reply === 'string' ? reply.trim() : '';
  const hasMedia = Boolean(media && typeof media === 'object');
  if (text || hasMedia) {
    return { ok: true, reply: text, completed: Boolean(completed), keptPartial: !completed };
  }
  if (error?.reason === 'stream') return { ok: false, reason: 'stream' };
  if (error) return { ok: false, reason: error.reason || 'network' };
  return { ok: false, reason: 'empty' };
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
