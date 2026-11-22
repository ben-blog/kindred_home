import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_MAX_TEXT,
  createSseReader,
  EMOJI_GROUPS,
  insertAtCaret,
  isIncompleteGrapheme,
  joinBatch,
  retryDelayMs,
  stablePrefix,
  takeBatch,
} from './chat-compose.js';

test('queued lines join in order until the route text cap', () => {
  const pending = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
  const batch = takeBatch(pending);
  assert.equal(joinBatch(batch), 'one\ntwo\nthree');
  assert.equal(pending.length, 0);

  const long = [{ text: 'a'.repeat(1500) }, { text: 'b'.repeat(1500) }];
  const first = takeBatch(long);
  assert.equal(first.length, 1);
  assert.equal(first[0].text, 'a'.repeat(1500));
  assert.equal(long.length, 1);
  assert.equal(long[0].text, 'b'.repeat(1500));
});

test('a newline between lines counts toward the 2000 cap', () => {
  const pending = [
    { text: 'a'.repeat(1000) },
    { text: 'b'.repeat(1000) },
    { text: 'c'.repeat(10) },
  ];
  const first = takeBatch(pending);
  assert.deepEqual(
    first.map((item) => item.text),
    ['a'.repeat(1000)]
  );
  const second = takeBatch(pending);
  assert.equal(joinBatch(second), `${'b'.repeat(1000)}\n${'c'.repeat(10)}`);
  assert.equal(pending.length, 0);
  assert.ok(joinBatch(second).length <= CHAT_MAX_TEXT);
});

test('an over-long line is split instead of dropped', () => {
  const pending = [{ text: `${'가'.repeat(2001)}`, row: { id: 'row' } }];
  const batch = takeBatch(pending);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].text.length, CHAT_MAX_TEXT);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].silent, true);
  assert.equal(batch[0].text.length + pending[0].text.length, 2001);
});

test('stablePrefix holds incomplete emoji and releases a finished cluster', () => {
  assert.equal(stablePrefix('hello'), 'hello');
  assert.equal(stablePrefix('Hi 😀'), 'Hi 😀');
  assert.equal(stablePrefix('Hi \uD83D'), 'Hi ');
  assert.equal(isIncompleteGrapheme('\uD83D'), true);
  assert.equal(stablePrefix('👨'), '👨');
  assert.equal(stablePrefix('👨\u200D'), '');
  assert.equal(stablePrefix('👨\u200D👩'), '👨\u200D👩');
  assert.equal(stablePrefix('Say 👨\u200D👩\u200D'), 'Say ');
  assert.equal(stablePrefix('👨\u200D👩\u200D👧'), '👨\u200D👩\u200D👧');
  assert.equal(stablePrefix('\uD83C\uDDF0'), '');
  assert.equal(stablePrefix('\uD83C\uDDF0\uD83C\uDDF7'), '\uD83C\uDDF0\uD83C\uDDF7');
  assert.equal(stablePrefix('1\uFE0F'), '');
  assert.equal(stablePrefix('1\uFE0F\u20E3'), '1\uFE0F\u20E3');
  assert.equal(stablePrefix('❤️'), '❤️');
});

test('the SSE reader keeps a character split across chunks', () => {
  const reader = createSseReader();
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify({ type: 'token', text: 'Hi 😀' })}\n\n`
  );
  const split = bytes.findIndex((byte, index) => byte === 0xf0 && bytes[index + 1] === 0x9f);
  assert.ok(split > 0);
  assert.deepEqual(reader.push(bytes.slice(0, split + 1)), []);
  const events = reader.push(bytes.slice(split + 1));
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'Hi 😀');
  assert.equal(events[0].text.includes('\uFFFD'), false);
});

test('retry-after accepts seconds and dates and ignores junk', () => {
  const now = Date.parse('2026-11-22T00:00:00Z');
  assert.equal(retryDelayMs('1', now), 1000);
  assert.equal(retryDelayMs('60', now), 60_000);
  assert.equal(retryDelayMs('9999', now), 120_000);
  assert.equal(retryDelayMs('Sun, 22 Nov 2026 00:00:30 GMT', now), 30_000);
  assert.equal(retryDelayMs('nope', now), 60_000);
  assert.equal(retryDelayMs('', now), 60_000);
});

test('emoji insert lands at the caret and skips a live composition', () => {
  const input = {
    value: 'ac',
    selectionStart: 1,
    selectionEnd: 1,
    maxLength: 2000,
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = start + text.length;
      this.selectionEnd = this.selectionStart;
    },
  };
  assert.equal(insertAtCaret(input, '😊', { composing: true }), false);
  assert.equal(input.value, 'ac');
  assert.equal(insertAtCaret(input, '😊'), true);
  assert.equal(input.value, 'a😊c');

  input.value = 'abcd';
  input.maxLength = 4;
  input.selectionStart = 4;
  input.selectionEnd = 4;
  assert.equal(insertAtCaret(input, '✨'), false);
  assert.equal(input.value, 'abcd');
});

test('the picker is a small mood grid', () => {
  const ids = EMOJI_GROUPS.map((group) => group.id);
  assert.deepEqual(ids, ['joy', 'playful', 'calm', 'shy', 'sad', 'intense', 'tired']);
  let count = 0;
  for (const group of EMOJI_GROUPS) {
    assert.ok(group.emoji.length >= 4);
    count += group.emoji.length;
  }
  assert.ok(count < 80);
});
