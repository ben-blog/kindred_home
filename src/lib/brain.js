/**
 * Read-only views over one memory-map snapshot.
 * Points keep the proxy shape: id, kind, label, createdAt, x, y, z,
 * and optional weight, strength, decay. There is no second snapshot,
 * so removals and historical weakening are not computable here.
 */

export const SUMMARY_SECTIONS = [
  { id: 'knowledge', kinds: ['knowledge'] },
  { id: 'reflection', kinds: ['reflection'] },
  { id: 'behavior', kinds: ['pattern'] },
  { id: 'user', kinds: ['experience'] },
];

const KIND_ORDER = [
  'knowledge',
  'experience',
  'declaration',
  'pattern',
  'album_moment',
  'reflection',
];

const METRICS = ['weight', 'strength', 'decay'];
const WEAK_WEIGHT = 0.35;

export function pointTime(point) {
  if (!point || typeof point.createdAt !== 'string') return null;
  const ms = Date.parse(point.createdAt);
  return Number.isFinite(ms) ? ms : null;
}

export function startOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function parseDayInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

export function formatDay(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}.`;
}

export function formatStamp(ms) {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDay(ms)} ${hh}:${mm}`;
}

export function rangeBounds(preset, now, custom) {
  const at = Number.isFinite(now) ? now : Date.now();
  if (preset === 'all') return { from: null, to: null, preset: 'all' };
  if (preset === 'today') {
    return { from: startOfLocalDay(at), to: endOfLocalDay(at), preset: 'today' };
  }
  if (preset === '7' || preset === '30') {
    const days = preset === '7' ? 6 : 29;
    const start = new Date(startOfLocalDay(at));
    start.setDate(start.getDate() - days);
    return { from: start.getTime(), to: endOfLocalDay(at), preset };
  }
  const fromDay = parseDayInput(custom?.from) ?? startOfLocalDay(at);
  const toDay = parseDayInput(custom?.to) ?? startOfLocalDay(at);
  if (fromDay <= toDay) {
    return { from: startOfLocalDay(fromDay), to: endOfLocalDay(toDay), preset: 'custom' };
  }
  return {
    from: startOfLocalDay(toDay),
    to: endOfLocalDay(fromDay),
    preset: 'custom',
    swapped: true,
  };
}

export function filterPoints(points, bounds) {
  const from = bounds?.from ?? null;
  const to = bounds?.to ?? null;
  const kept = [];
  let undated = 0;
  for (const point of Array.isArray(points) ? points : []) {
    const ms = pointTime(point);
    if (ms == null) {
      undated += 1;
      if (from == null && to == null) kept.push(point);
      continue;
    }
    if (from != null && ms < from) continue;
    if (to != null && ms > to) continue;
    kept.push(point);
  }
  kept.sort(byTime);
  return { points: kept, undated };
}

export function diffMemories(points, dayA, dayB) {
  const a = parseDayInput(dayA) ?? startOfLocalDay(Date.now());
  const b = parseDayInput(dayB) ?? startOfLocalDay(Date.now());
  const swapped = a > b;
  const from = startOfLocalDay(swapped ? b : a);
  const to = endOfLocalDay(swapped ? a : b);
  const present = [];
  const added = [];
  const list = Array.isArray(points) ? points : [];
  const exposed = METRICS.filter((key) => list.some((point) => typeof point?.[key] === 'number'));
  for (const point of list) {
    const ms = pointTime(point);
    if (ms == null || ms > to) continue;
    present.push(point);
    if (ms >= from) added.push(point);
  }
  present.sort(byTime);
  added.sort(byTime);
  const weakened = [];
  if (exposed.length) {
    for (const point of present) {
      const ms = pointTime(point);
      if (ms == null || ms >= from) continue;
      if (isWeak(point)) weakened.push(point);
    }
  }
  return {
    from,
    to,
    swapped,
    present,
    added,
    weakened,
    removed: [],
    exposed,
    additionsOnly: exposed.length === 0,
  };
}

export function regionModel(points, bounds, options = {}) {
  const maxBuckets = options.maxBuckets || 120;
  const dated = (Array.isArray(points) ? points : [])
    .map((point) => ({ point, ms: pointTime(point) }))
    .filter((item) => item.ms != null)
    .sort((a, b) => a.ms - b.ms || String(a.point.id).localeCompare(String(b.point.id)));
  if (!dated.length) {
    return { kinds: [], buckets: [], totals: {}, stepDays: 1, max: 0 };
  }
  let start = bounds?.from != null ? startOfLocalDay(bounds.from) : startOfLocalDay(dated[0].ms);
  let end = bounds?.to != null ? startOfLocalDay(bounds.to) : startOfLocalDay(dated[dated.length - 1].ms);
  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  const span = Math.max(1, eachDay(start, end).length);
  const stepDays = Math.max(1, Math.ceil(span / maxBuckets));
  const kinds = orderKinds(dated.map((item) => item.point.kind));
  const buckets = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end && buckets.length < maxBuckets + 2) {
    const bucketStart = cursor.getTime();
    const next = new Date(bucketStart);
    next.setDate(next.getDate() + stepDays);
    const bucketEnd = Math.min(endOfLocalDay(end), next.getTime() - 1);
    buckets.push({
      start: bucketStart,
      end: bucketEnd,
      counts: Object.fromEntries(kinds.map((kind) => [kind, 0])),
      cumulative: Object.fromEntries(kinds.map((kind) => [kind, 0])),
    });
    cursor.setDate(cursor.getDate() + stepDays);
  }
  if (!buckets.length) {
    return { kinds, buckets: [], totals: {}, stepDays, max: 0 };
  }
  const running = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  let index = 0;
  for (const item of dated) {
    if (item.ms < buckets[0].start || item.ms > buckets[buckets.length - 1].end) continue;
    while (index < buckets.length - 1 && item.ms > buckets[index].end) index += 1;
    const kind = kinds.includes(item.point.kind) ? item.point.kind : kinds[0];
    buckets[index].counts[kind] += 1;
  }
  let max = 0;
  for (const bucket of buckets) {
    for (const kind of kinds) {
      running[kind] += bucket.counts[kind];
      bucket.cumulative[kind] = running[kind];
    }
    const total = kinds.reduce((sum, kind) => sum + bucket.cumulative[kind], 0);
    if (total > max) max = total;
  }
  return { kinds, buckets, totals: { ...running }, stepDays, max };
}

export function summarizeDays(points, bounds) {
  const filtered = filterPoints(points, bounds);
  const byDay = new Map();
  for (const point of filtered.points) {
    const ms = pointTime(point);
    if (ms == null) continue;
    const key = startOfLocalDay(ms);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(point);
  }
  const bounded = bounds?.from != null && bounds?.to != null;
  const span = bounded ? eachDay(bounds.from, bounds.to).length : byDay.size;
  const includeEmpty = bounded && span <= 31;
  const days = includeEmpty
    ? eachDay(bounds.from, bounds.to)
    : [...byDay.keys()].sort((a, b) => a - b);
  const cards = days
    .slice()
    .sort((a, b) => b - a)
    .map((day) => {
      const items = byDay.get(day) || [];
      const sections = SUMMARY_SECTIONS.map((section) => ({
        id: section.id,
        items: items.filter((point) => section.kinds.includes(point.kind)),
      }));
      const claimed = new Set(SUMMARY_SECTIONS.flatMap((section) => section.kinds));
      const extraMap = new Map();
      for (const point of items) {
        if (claimed.has(point.kind)) continue;
        if (!extraMap.has(point.kind)) extraMap.set(point.kind, []);
        extraMap.get(point.kind).push(point);
      }
      const extra = [...extraMap.entries()].map(([kind, list]) => ({ kind, items: list }));
      return { day, count: items.length, sections, extra };
    });
  return {
    cards,
    undated: filtered.undated,
    includeEmpty,
    omittedEmpty: !includeEmpty,
  };
}

export function eachDay(fromMs, toMs) {
  const days = [];
  const cursor = new Date(startOfLocalDay(fromMs));
  const end = startOfLocalDay(toMs);
  while (cursor.getTime() <= end && days.length < 800) {
    days.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function orderKinds(values) {
  const seen = [];
  for (const kind of values) {
    if (kind && !seen.includes(kind)) seen.push(kind);
  }
  return [
    ...KIND_ORDER.filter((kind) => seen.includes(kind)),
    ...seen.filter((kind) => !KIND_ORDER.includes(kind)),
  ];
}

function isWeak(point) {
  if (typeof point.decay === 'number' && point.decay > 0) return true;
  if (typeof point.weight === 'number' && point.weight < WEAK_WEIGHT) return true;
  if (typeof point.strength === 'number' && point.strength < WEAK_WEIGHT) return true;
  return false;
}

function byTime(a, b) {
  const left = pointTime(a);
  const right = pointTime(b);
  if (left == null && right == null) return String(a.id).localeCompare(String(b.id));
  if (left == null) return -1;
  if (right == null) return 1;
  return left - right || String(a.id).localeCompare(String(b.id));
}
