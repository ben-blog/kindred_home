/** Layout grounds measured from the hubs. A file's `identity.ground` wins. */
export const layoutGrounds = {
  board: '#080806',
  void: '#000000',
  sheet: '#080806',
};

/** Ink for type that sits on a filled accent. Light accents get the board ground. */
export function inkForAccent(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(hex ?? ''));
  if (!match) return '#080806';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? '#080806' : 'rgba(255,255,255,.92)';
}

export function characterSurface(character) {
  const layout = Object.hasOwn(layoutGrounds, character?.layout) ? character.layout : 'sheet';
  const identity = character?.identity ?? {};
  const accent = typeof identity.color === 'string' ? identity.color : '#ffffff';
  const ground = identity.ground || layoutGrounds[layout];
  return { layout, accent, ground, ink: inkForAccent(accent) };
}

export function cssBezier(easing) {
  if (
    !Array.isArray(easing) ||
    easing.length !== 4 ||
    easing.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    return 'cubic-bezier(.16,1,.3,1)';
  }
  return `cubic-bezier(${easing.join(',')})`;
}

export function cssTime(value, unit, fallback) {
  const number = Number(value);
  const safe = Number.isFinite(number) && number > 0 ? number : fallback;
  return `${safe}${unit}`;
}
