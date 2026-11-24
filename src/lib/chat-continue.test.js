import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTINUE_MAX,
  CONTINUE_GAP_MS,
  isContinueRequest,
  isStopRequest,
  createContinueLimiter,
} from './chat-continue.js';

test('continue commands recognize explicit talk requests', () => {
  for (const text of [
    '계속 말해',
    ' 계속 말해줘! ',
    '계속 얘기해',
    '계속 이야기해',
    '계속 얘기해줘',
    '계속 이야기해줘',
    '이야기를 계속 해줘',
    '멈추라고 할 때까지 계속 얘기해',
    '멈추라고 할 때까지 이야기해',
    '그만하라고 할 때까지 계속 말해',
    '그만하라면 멈추고 계속 이야기해',
    'Keep Talking!',
    'keep going',
    'keep speaking',
    "don't stop until I say stop",
  ])
    assert.equal(isContinueRequest(text), true, text);
  for (const text of [
    undefined,
    '',
    '계속 그 생각 중이었어',
    '계속 해줘',
    '계속 작업해줘',
    '이야기가 계속 생각나',
    'keep talking이라고 했어',
    '계속 말해도 돼?',
    '그만',
  ]) {
    assert.equal(isContinueRequest(text), false, String(text));
  }
});

test('stop commands allow light punctuation but not incidental mentions', () => {
  for (const text of [
    '그만',
    '멈춰!',
    '그만해',
    '이제 그만.',
    '그만 말해',
    '그만 얘기',
    ' STOP ',
    'stop talking!',
  ]) {
    assert.equal(isStopRequest(text), true, text);
  }
  for (const text of [
    '',
    undefined,
    '그만 생각해볼게',
    '멈춰 있는 시계',
    'stop talking about music',
  ]) {
    assert.equal(isStopRequest(text), false, String(text));
  }
});

test('continue limiter caps at 30 without advancing rejected requests and resets', () => {
  assert.equal(CONTINUE_MAX, 30);
  assert.equal(CONTINUE_GAP_MS, 4000);
  const limiter = createContinueLimiter();
  for (let i = 0; i < 30; i += 1) assert.equal(limiter.allow('a', true, i), true);
  assert.equal(limiter.allow('a', true, 31), false);
  assert.equal(limiter.allow('a', true, 32), false);
  assert.equal(limiter.allow('b', true, 32), true);
  assert.equal(limiter.allow('a', false, 33), true);
  assert.equal(limiter.allow('a', true, 34), true);
  limiter.reset('a');
  assert.equal(limiter.allow('a', true, 35), true);
});

test('continue limiter expires entries and evicts the oldest key', () => {
  const limiter = createContinueLimiter({ max: 1, ttlMs: 100, maxKeys: 2 });
  assert.equal(limiter.allow('a', true, 0), true);
  assert.equal(limiter.allow('a', true, 99), false);
  assert.equal(limiter.allow('a', true, 100), true);
  assert.equal(limiter.allow('b', true, 101), true);
  assert.equal(limiter.allow('c', true, 102), true);
  assert.equal(limiter.allow('b', true, 103), false);
  assert.equal(limiter.allow('a', true, 103), true);
});
