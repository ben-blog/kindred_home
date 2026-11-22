import assert from 'node:assert/strict';
import test from 'node:test';
import {
  memoryEmotionColor,
  memoryEmotionCss,
  memoryEmotionLabel,
  memoryEmotions,
} from '../config/memory-emotions.js';
import { expressionEmotions } from '../../world/schema.js';

const kin = '#FFE500';
const dred = '#5B4FCF';

function luminance(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

test('memory emotions match the expression list and use English labels', () => {
  assert.deepEqual(memoryEmotions, expressionEmotions);
  for (const emotion of memoryEmotions) {
    assert.equal(memoryEmotionLabel(emotion), emotion);
    assert.equal(memoryEmotionCss(kin, emotion).startsWith('#'), true);
  }
  assert.equal(memoryEmotionLabel('rage'), '');
  assert.equal(memoryEmotionColor(kin, 'rage', 1), null);
  assert.equal(memoryEmotionColor('yellow', 'joy', 1), null);
});

test('emotion colors stay near the character accent and intensity changes brightness', () => {
  for (const accent of [kin, dred]) {
    const base = memoryEmotionColor(accent, 'calm', 0.72);
    const baseHue = rgbToHsl(base.r, base.g, base.b).h;
    const seen = new Set();
    for (const emotion of memoryEmotions) {
      const mid = memoryEmotionColor(accent, emotion, 0.72);
      const dim = memoryEmotionColor(accent, emotion, 0);
      const bright = memoryEmotionColor(accent, emotion, 1);
      assert.ok(luminance(bright) > luminance(dim));
      const hsl = rgbToHsl(mid.r, mid.g, mid.b);
      assert.ok(hueDistance(hsl.h, baseHue) <= 0.16, `${accent} ${emotion}`);
      seen.add(memoryEmotionCss(accent, emotion, 0.72));
    }
    assert.equal(seen.size, memoryEmotions.length);
    const calm = rgbToHsl(...Object.values(memoryEmotionColor(accent, 'calm', 0.72)));
    const intense = rgbToHsl(...Object.values(memoryEmotionColor(accent, 'intense', 0.72)));
    assert.ok(calm.s < intense.s);
  }

  const board = memoryEmotionColor(dred, 'joy', 0.5, 'board');
  const voided = memoryEmotionColor(dred, 'joy', 0.5, 'void');
  assert.ok(luminance(voided) > luminance(board));

  const kinJoy = memoryEmotionCss(kin, 'joy', 1);
  const dredJoy = memoryEmotionCss(dred, 'joy', 1);
  assert.notEqual(kinJoy, dredJoy);
});
