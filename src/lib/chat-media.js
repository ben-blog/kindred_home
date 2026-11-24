import { safeHttpUrl } from './safe-url.js';
export function chatMedia(value) {
  const url = safeHttpUrl(value?.url);
  if (!url) return null;
  const media = { url };
  if (typeof value.alt === 'string') media.alt = value.alt.slice(0, 500);
  for (const key of ['width', 'height'])
    if (Number.isFinite(value[key]) && value[key] > 0)
      media[key] = Math.min(20000, Math.round(value[key]));
  return media;
}
