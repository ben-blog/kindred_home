import assert from 'node:assert/strict';
import test from 'node:test';
import { rateNote } from '../scripts/warmth.js';

test('a rate limit says how many minutes to wait', () => {
  assert.equal(rateNote('600'), 'already sent, try again in 10 min');
  assert.equal(rateNote('60'), 'already sent, try again in 1 min');
  assert.equal(rateNote('90'), 'already sent, try again in 2 min');
  assert.equal(rateNote(null), 'already sent, try again in 10 min');
});

test('hub warmth notes handle 429 cooldown and failure without changing public defaults', async () => {
  const { bindWarmth } = await import('../scripts/warmth.js');
  const original = { fetch: globalThis.fetch, location: globalThis.location, setTimeout: globalThis.setTimeout };
  const listeners = {};
  const note = { dataset: {}, classList: { add() {} } };
  const button = { dataset: {}, textContent: 'Warmth +1', addEventListener: (key, fn) => { listeners[key] = fn; } };
  const events = [];
  const control = {
    dataset: { warmth: 'kin', noteSent: '보냄 · 다음 tick에 반영', noteWait: 'Warmth · {minutes}분 뒤', noteFail: 'warmth를 못 보냈습니다. 다시 시도' },
    querySelector: (selector) => selector === 'button' ? button : note,
    dispatchEvent: (event) => events.push(event.type),
  };
  try {
    globalThis.location = { pathname: '/world/admin' };
    globalThis.setTimeout = () => 0;
    globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '90' } });
    bindWarmth({ querySelectorAll: () => [control] });
    listeners.click();
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.textContent, 'Warmth · 2분 뒤');
    assert.equal(button.disabled, true);
    assert.equal(note.textContent, 'Warmth · 2분 뒤');
    globalThis.fetch = async () => new Response('{}', { status: 502 });
    listeners.click();
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(note.textContent, control.dataset.noteFail);
    assert.equal(note.dataset.outcome, 'failed');
    assert.deepEqual(events, ['warmth:failed']);
  } finally {
    Object.assign(globalThis, original);
  }
});
