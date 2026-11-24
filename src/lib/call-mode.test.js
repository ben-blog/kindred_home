import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MODE_LABELS,
  adultModeStorageKey,
  applyModeState,
  buildChatPayload,
  leaderAdultFlag,
  modeControlState,
} from './call-mode.js';

function element() {
  const classes = new Set();
  const attrs = new Map();
  return {
    textContent: '',
    tabIndex: 0,
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
  };
}

test('mode 1 is normal and mode 2 is the adult segment', () => {
  const off = modeControlState(false);
  assert.equal(off.mode1.on, true);
  assert.equal(off.mode2.on, false);
  assert.equal(off.mode1.label, '모드 1');
  assert.equal(off.mode2.label, '모드 2');
  assert.equal(off.chip.text, '모드 1');
  assert.equal(off.chip.on, false);
  assert.equal(off.presenceTint, false);
  assert.equal(off.notice, '');
  assert.equal(off.leaderAdultMode, false);

  const on = modeControlState(true);
  assert.equal(on.mode1.on, false);
  assert.equal(on.mode2.on, true);
  assert.equal(on.chip.text, '모드 2');
  assert.equal(on.chip.on, true);
  assert.equal(on.presenceTint, true);
  assert.equal(on.notice, '모드 2가 켜져 있어요');
  assert.equal(on.leaderAdultMode, true);
  assert.equal(on.mode2.name, MODE_LABELS.mode2Name);
});

test('the segmented control uses is-on and the header chip shows the mode', () => {
  const nodes = { root: element(), mode1: element(), mode2: element(), chip: element() };

  applyModeState(nodes, false);
  assert.equal(nodes.mode1.classList.contains('is-on'), true);
  assert.equal(nodes.mode2.classList.contains('is-on'), false);
  assert.equal(nodes.mode1.getAttribute('aria-pressed'), 'true');
  assert.equal(nodes.mode2.getAttribute('aria-pressed'), 'false');
  assert.equal(nodes.mode1.getAttribute('aria-checked'), 'true');
  assert.equal(nodes.mode1.textContent, '모드 1');
  assert.equal(nodes.mode2.textContent, '모드 2');
  assert.equal(nodes.mode1.getAttribute('aria-label'), MODE_LABELS.mode1Name);
  assert.equal(nodes.chip.textContent, '모드 1');
  assert.equal(nodes.chip.classList.contains('is-on'), false);
  assert.equal(nodes.chip.getAttribute('aria-label'), MODE_LABELS.mode1Chip);
  assert.equal(nodes.root.classList.contains('is-mode-2'), false);

  applyModeState(nodes, true);
  assert.equal(nodes.mode1.classList.contains('is-on'), false);
  assert.equal(nodes.mode2.classList.contains('is-on'), true);
  assert.equal(nodes.mode2.getAttribute('aria-pressed'), 'true');
  assert.equal(nodes.chip.textContent, '모드 2');
  assert.equal(nodes.chip.classList.contains('is-on'), true);
  assert.equal(nodes.chip.getAttribute('aria-label'), MODE_LABELS.mode2Chip);
  assert.equal(nodes.root.classList.contains('is-mode-2'), true);
});

test('mode off sends no flag, mode on sends it only for the DRED leader path', () => {
  assert.equal(adultModeStorageKey('dred'), 'call:dred:adultMode');
  assert.equal(leaderAdultFlag('dred', false), false);
  assert.equal(leaderAdultFlag('dred', true), true);
  assert.equal(leaderAdultFlag('dred', 'true'), false);
  assert.equal(leaderAdultFlag('dred', 1), false);
  assert.equal(leaderAdultFlag('kin', true), false);

  const messages = [{ role: 'user', content: 'hey' }];
  const off = buildChatPayload({ slug: 'dred', modeOn: false, messages, sessionId: 'sess-1' });
  assert.equal(Object.hasOwn(off, 'leaderAdultMode'), false);
  assert.equal(off.sessionId, 'sess-1');

  const on = buildChatPayload({ slug: 'dred', modeOn: true, messages, sessionId: 'sess-1' });
  assert.equal(on.leaderAdultMode, true);
  assert.equal(typeof on.leaderAdultMode, 'boolean');

  const kin = buildChatPayload({
    slug: 'kin',
    modeOn: true,
    messages,
    sessionId: 'sess-1',
  });
  assert.equal(Object.hasOwn(kin, 'leaderAdultMode'), false);

  const continuous = buildChatPayload({
    slug: 'dred',
    modeOn: true,
    messages,
    sessionId: 'sess-1',
    continuation: true,
  });
  assert.equal(continuous.continue, true);
  assert.equal(continuous.leaderAdultMode, true);
});

test('outbound history stays inside the same 24-message window', () => {
  const messages = [];
  for (let index = 0; index < 30; index += 1) {
    messages.push({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` });
  }
  const payload = buildChatPayload({ slug: 'dred', modeOn: false, messages });
  assert.equal(payload.messages.length, 24);
  assert.equal(payload.messages[0].content, 'm6');
  assert.equal(payload.messages.at(-1).content, 'm29');
  assert.equal(Object.hasOwn(payload, 'leaderAdultMode'), false);
});

test('the call page keeps the mode control and chip on the DRED leader call', () => {
  const page = readFileSync(new URL('../pages/world/chat/[slug].astro', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../scripts/call-chat.js', import.meta.url), 'utf8');
  const blocks = [];
  const needle = "data.slug === 'dred'";
  let index = 0;
  while ((index = page.indexOf(needle, index)) !== -1) {
    const end = page.indexOf(')}', index);
    blocks.push(page.slice(index, end === -1 ? index + 500 : end));
    index += needle.length;
  }
  assert.ok(blocks.some((block) => block.includes('id="call-mode-chip"')));
  assert.ok(blocks.some((block) => block.includes('id="call-mode-2"')));
  assert.match(page, /'모드 1'/);
  assert.match(page, /'모드 2'/);
  assert.match(page, /'모드 2가 켜져 있어요'/);
  assert.doesNotMatch(page, /성인 모드/);
  assert.match(client, /applyModeState\(/);
  assert.match(client, /buildChatPayload\(/);
  assert.match(client, /loadThread\(/);
  assert.match(client, /saveThread\(/);
  assert.match(client, /seededHistory/);
  assert.doesNotMatch(client, /sessionStorage\.setItem/);
  assert.doesNotMatch(client, /leaderAdultMode/);
});
