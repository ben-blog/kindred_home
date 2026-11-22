import { site } from '../config/site.js';

/** Site locale list. Pages do not choose a language; they use this default. */
export function loadSite() {
  return site;
}

/**
 * Resolve one string from a localized field.
 * A plain string is returned as-is (relation notes that are not maps).
 * The requested locale is used only when the site lists it. Otherwise, and
 * when that locale has no value, the result is `en`.
 */
export function text(copy, locale = site.defaultLocale, config = site) {
  if (typeof copy === 'string') return copy;
  if (!copy || typeof copy !== 'object') return '';
  const requested = config.locales?.includes(locale) ? locale : 'en';
  const chosen = copy[requested];
  if (typeof chosen === 'string' && chosen.length > 0) return chosen;
  return typeof copy.en === 'string' ? copy.en : '';
}
