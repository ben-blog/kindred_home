import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_MAX_MESSAGES, CHAT_MAX_TEXT } from './chat-compose.js';
import {
  clearStoredThread,
  loadThread,
  saveThread,
  threadShowsIdle,
  threadStorageKey,
} from './call-thread.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function turn(index) {
  return {
    role: index % 2 ? 'assistant' : 'user',
    content: `m${index}`,
    id: `m_${index}`,
    at: `2026-11-24T01:${String(index).padStart(2, '0')}:00.000Z`,
  };
}

test('a thread survives reload in a new tab and reuses the session id', () => {
  const local = memoryStorage();
  const firstTab = memoryStorage({ 'call:dred': 'sess-kept' });
  const migrated = loadThread(local, firstTab, 'dred');
  assert.equal(migrated.sessionId, 'sess-kept');
  assert.equal(firstTab.getItem('call:dred'), null);
  assert.equal(threadShowsIdle(migrated), true);

  const saved = saveThread(local, 'dred', {
    sessionId: migrated.sessionId,
    messages: [
      {
        role: 'user',
        content: 'hello',
        id: 'm_user',
        at: '2026-11-24T01:00:00.000Z',
        reply_to: { id: 'm_prev', excerpt: 'earlier', thumb: 'https://example.test/a.png' },
      },
      { role: 'assistant', content: 'hi', id: 'm_dred', at: '2026-11-24T01:00:02.000Z' },
    ],
    at: '2026-11-24T01:00:02.000Z',
  });
  assert.equal(saved.sessionId, 'sess-kept');
  assert.equal(saved.messages[0].reply_to.excerpt, 'earlier');
  assert.equal(saved.messages[0].reply_to.thumb, undefined);
  assert.equal(JSON.parse(local.getItem(threadStorageKey('dred'))).leaderAdultMode, undefined);

  const again = loadThread(local, memoryStorage(), 'dred');
  assert.equal(again.sessionId, 'sess-kept');
  assert.deepEqual(
    again.messages.map((message) => message.content),
    ['hello', 'hi']
  );
  assert.equal(again.messages[0].id, 'm_user');
  assert.equal(again.messages[1].at, '2026-11-24T01:00:02.000Z');
  assert.equal(threadShowsIdle(again), false);

  const continued = saveThread(local, 'dred', {
    sessionId: again.sessionId,
    messages: [...again.messages, { role: 'assistant', content: 'still talking', id: 'm_more' }],
    at: '2026-11-24T01:01:00.000Z',
  });
  assert.equal(continued.sessionId, 'sess-kept');
  assert.equal(continued.messages.at(-1).content, 'still talking');
  assert.equal(loadThread(local, memoryStorage(), 'dred').sessionId, 'sess-kept');
});

test('stored messages cap at the same 24 as clampHistory', () => {
  const local = memoryStorage();
  const messages = [];
  for (let index = 0; index < 30; index += 1) messages.push(turn(index));
  messages.push({ role: 'system', content: 'nope' });
  messages.push({ role: 'assistant', content: '   ' });
  messages.push({ role: 'user', content: '가'.repeat(CHAT_MAX_TEXT + 40), id: 'm_long' });
  const saved = saveThread(local, 'kin', {
    sessionId: 'sess-cap',
    messages,
    at: '2026-11-24T02:00:00.000Z',
  });
  assert.equal(CHAT_MAX_MESSAGES, 24);
  assert.equal(saved.messages.length, 24);
  assert.equal(saved.messages.at(-1).content, '가'.repeat(CHAT_MAX_TEXT));
  assert.equal(saved.messages.at(-1).id, 'm_long');
  assert.equal(
    saved.messages.some((message) => message.role === 'system'),
    false
  );
  assert.equal(saved.sessionId, 'sess-cap');

  const reloaded = loadThread(local, memoryStorage(), 'kin');
  assert.equal(reloaded.messages.length, 24);
  assert.equal(reloaded.sessionId, 'sess-cap');
  assert.equal(reloaded.messages.at(-1).content.length, CHAT_MAX_TEXT);
});

test('an existing thread session id wins over a leftover tab id', () => {
  const local = memoryStorage();
  saveThread(local, 'dred', {
    sessionId: 'sess-local',
    messages: [{ role: 'user', content: 'kept' }],
    at: '2026-11-24T03:00:00.000Z',
  });
  const session = memoryStorage({ 'call:dred': 'sess-old' });
  const loaded = loadThread(local, session, 'dred');
  assert.equal(loaded.sessionId, 'sess-local');
  assert.equal(loaded.messages[0].content, 'kept');
  assert.equal(session.getItem('call:dred'), null);
});

test('empty storage leaves the idle thread', () => {
  const local = memoryStorage();
  const session = memoryStorage({ 'call:kin': 'not a session' });
  const thread = loadThread(local, session, 'kin');
  assert.deepEqual(thread.messages, []);
  assert.equal(thread.sessionId, '');
  assert.equal(thread.at, '');
  assert.equal(threadShowsIdle(thread), true);
  assert.equal(local.getItem(threadStorageKey('kin')), null);

  saveThread(local, 'kin', {
    sessionId: 'sess-clear',
    messages: [{ role: 'user', content: 'bye' }],
  });
  clearStoredThread(local, session, 'kin');
  const cleared = loadThread(local, session, 'kin');
  assert.equal(threadShowsIdle(cleared), true);
  assert.equal(cleared.sessionId, '');
});

test('a broken thread record does not throw and stays idle', () => {
  const local = memoryStorage({ 'call:dred:thread': '{not json' });
  const thread = loadThread(local, memoryStorage(), 'dred');
  assert.equal(threadShowsIdle(thread), true);
  assert.equal(thread.sessionId, '');
});
