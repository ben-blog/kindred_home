/** Display bands only; these never alter world rules. */
export function gaugeBands(kind, rules) {
  const max = kind === 'mood' ? rules.moodMax : rules.energyMax;
  const ranges =
    kind === 'mood'
      ? [
          [0, 1, '낮음'],
          [2, 3, '보통'],
          [4, max, '높음'],
        ]
      : [
          [0, 2, '피곤'],
          [3, 6, '보통'],
          [7, max, '높음'],
        ];
  return ranges
    .filter(([min]) => min <= max)
    .map(([min, end, label]) => ({ min, max: Math.min(max, end), label }));
}
export function bandOf(kind, value, rules) {
  return (
    gaugeBands(kind, rules).find((band) => value >= band.min && value <= band.max)?.label ?? '—'
  );
}
