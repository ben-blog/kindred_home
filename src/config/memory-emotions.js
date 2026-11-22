/**
 * Emotion palette for the memory sphere.
 * `hue` is a turn offset from the character accent. Offsets stay small so each
 * globe stays in that character's color. Saturation is scaled by the accent's
 * own saturation. Intensity 0..1 moves lightness from `dim` toward `lightness`.
 * Labels are the English names shown on the legend and the hover tooltip.
 */
export const memoryEmotions = ['joy', 'playful', 'calm', 'shy', 'sad', 'intense', 'tired'];

export const memoryEmotionPalette = {
  joy: { hue: 0.018, saturation: 0.92, lightness: 0.62, dim: 0.34 },
  playful: { hue: 0.09, saturation: 0.78, lightness: 0.58, dim: 0.32 },
  calm: { hue: 0, saturation: 0.28, lightness: 0.72, dim: 0.46 },
  shy: { hue: -0.055, saturation: 0.5, lightness: 0.68, dim: 0.4 },
  sad: { hue: 0.062, saturation: 0.38, lightness: 0.36, dim: 0.16 },
  intense: { hue: -0.078, saturation: 0.96, lightness: 0.52, dim: 0.24 },
  tired: { hue: 0.008, saturation: 0.1, lightness: 0.52, dim: 0.3 },
};

export function memoryEmotionLabel(emotion) {
  return memoryEmotionPalette[emotion] ? emotion : '';
}

export function memoryEmotionColor(accent, emotion, intensity, layout) {
  const spec = memoryEmotionPalette[emotion];
  const base = parseHex(accent);
  if (!spec || !base) return null;
  const hsl = rgbToHsl(base.r, base.g, base.b);
  const t = intensity == null ? 0.72 : clamp01(intensity);
  const h = wrap(hsl.h + spec.hue);
  const family = 0.42 + 0.58 * hsl.s;
  const s = clamp01(spec.saturation * family * (0.68 + 0.32 * t));
  let l = spec.dim + (spec.lightness - spec.dim) * t;
  if (layout === 'void') l = Math.min(0.86, l + 0.05);
  return hslToRgb(h, s, clamp01(l));
}

export function memoryEmotionCss(accent, emotion, intensity, layout) {
  const color = memoryEmotionColor(accent, emotion, intensity, layout);
  if (!color) return '';
  const channel = (value) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
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
