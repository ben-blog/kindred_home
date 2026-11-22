/**
 * Felt-memory line shared with mirrored-api src/memory/emotion.js.
 * The first line is the emotion. The rest is the story the sphere labels.
 */
const EMOTIONS = new Set(['joy', 'playful', 'calm', 'shy', 'sad', 'intense', 'tired']);

export function clampIntensity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(0, Math.min(1, number)) * 100) / 100;
}

export function normalizeFeltEmotion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const label = String(raw.label || '')
    .trim()
    .toLowerCase();
  if (!EMOTIONS.has(label)) return null;
  const intensity = clampIntensity(raw.intensity);
  if (intensity == null) return null;
  const reason =
    typeof raw.reason === 'string' ? raw.reason.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
  return { label, intensity, reason };
}

export function composeFeltMemory(summary, emotion) {
  const body = String(summary || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  const felt = normalizeFeltEmotion(emotion);
  if (!felt) return body;
  const reason = felt.reason ? ` — ${felt.reason}` : '';
  const line = `느낌: ${felt.label} ${felt.intensity.toFixed(2)}${reason}`;
  return body ? `${line}\n${body}` : line;
}
