import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  characterSurface,
  cssBezier,
  cssTime,
  inkForAccent,
  layoutGrounds,
} from './character-layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('layout grounds stay with the template, and a file ground wins', () => {
  assert.equal(characterSurface({ layout: 'void', identity: { color: '#5B4FCF' } }).ground, layoutGrounds.void);
  assert.equal(
    characterSurface({ layout: 'board', identity: { color: '#FFE500', ground: '#111111' } }).ground,
    '#111111'
  );
  assert.equal(characterSurface({ layout: 'nope', identity: { color: '#ffffff' } }).layout, 'sheet');
  assert.equal(characterSurface({ identity: { color: '#ffffff' } }).ground, layoutGrounds.sheet);
});

test('filled accent ink stays readable', () => {
  assert.equal(inkForAccent('#FFE500'), '#080806');
  assert.equal(inkForAccent('#5B4FCF'), 'rgba(255,255,255,.92)');
  assert.equal(inkForAccent('#000000'), 'rgba(255,255,255,.92)');
  assert.equal(inkForAccent('yellow'), '#080806');
});

test('motion css is read from the mark, with a shared fallback', () => {
  assert.equal(cssBezier([0.87, 0, 0.13, 1]), 'cubic-bezier(0.87,0,0.13,1)');
  assert.equal(cssBezier([0.34, 1.56, 0.64, 1]), 'cubic-bezier(0.34,1.56,0.64,1)');
  assert.equal(cssBezier([1, 2]), 'cubic-bezier(.16,1,.3,1)');
  assert.equal(cssTime(280, 'ms', 100), '280ms');
  assert.equal(cssTime(1.6, 's', 1), '1.6s');
  assert.equal(cssTime(0, 'ms', 280), '280ms');
});

test('character templates do not hardcode a character accent, name, or easing', () => {
  const dir = path.join(here, '../components/character');
  const page = path.join(here, '../pages/characters/[slug].astro');
  const files = [
    page,
    ...readdirSync(dir)
      .filter((name) => name.endsWith('.astro'))
      .map((name) => path.join(dir, name)),
  ];
  const banned = [
    /#(?:FFE500|5B4FCF)\b/i,
    /cubic-bezier\(\s*\.87/,
    /cubic-bezier\(\s*\.34\s*,\s*1\.56/,
    /===\s*['"](?:kin|dred)['"]/,
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of banned) {
      assert.equal(pattern.test(source), false, `${path.basename(file)} matches ${pattern}`);
    }
  }
});
