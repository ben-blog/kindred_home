/**
 * Kind colors for the brain map. Album moments keep the coral already used on
 * the call sphere. Other kinds stay near the character accent.
 */

const TURNS = {
  knowledge: 0,
  experience: 0.1,
  declaration: -0.08,
  pattern: 0.16,
  reflection: 0.22,
};

export function memoryKindRgb(accent, kind, layout) {
  if (kind === 'album_moment') {
    return layout === 'void' ? { r: 1, g: 0.62, b: 0.48 } : { r: 1, g: 0.42, b: 0.29 };
  }
  const base = parseHex(accent);
  if (!base) return { r: 1, g: 1, b: 1 };
  const hsl = rgbToHsl(base.r, base.g, base.b);
  const turn = Object.hasOwn(TURNS, kind) ? TURNS[kind] : ((hashKind(kind) % 7) * 0.035);
  const h = wrap(hsl.h + turn);
  const s = clamp01(Math.max(0.38, hsl.s * 0.9));
  let l = layout === 'void' ? 0.8 : 0.58;
  if (kind === 'reflection') l = layout === 'void' ? 0.7 : 0.46;
  return hslToRgb(h, s, l);
}

export function memoryKindCss(accent, kind, layout) {
  const color = memoryKindRgb(accent, kind, layout);
  const channel = (value) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function hashKind(kind) {
  return [...String(kind)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function parseHex(value) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  const n = Number.parseInt(value.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
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

function hslToRgb(h, s, l) {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
}

function hueToRgb(p, q, t) {
  let hue = t;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

function wrap(value) {
  return ((value % 1) + 1) % 1;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
