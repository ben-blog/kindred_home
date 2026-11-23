import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diffMemories,
  filterPoints,
  formatDay,
  parseDayInput,
  rangeBounds,
  regionModel,
  summarizeDays,
} from './brain.js';
import { memoryKindCss } from './memory-kind.js';

function point(id, kind, createdAt, extra = {}) {
  return { id, kind, label: id, createdAt, x: 0, y: 1, z: 0, ...extra };
}

function at(year, month, day, hour = 12) {
  return new Date(year, month - 1, day, hour).toISOString();
}

test('ranges use local days and custom dates swap when reversed', () => {
  const now = new Date(2026, 10, 22, 15, 4).getTime();
  const today = rangeBounds('today', now);
  assert.equal(today.from, new Date(2026, 10, 22).getTime());
  assert.equal(today.to, new Date(2026, 10, 22, 23, 59, 59, 999).getTime());
  const week = rangeBounds('7', now);
  assert.equal(week.from, new Date(2026, 10, 16).getTime());
  assert.equal(rangeBounds('all', now).from, null);
  const custom = rangeBounds('custom', now, { from: '2026-11-20', to: '2026-11-01' });
  assert.equal(custom.swapped, true);
  assert.equal(custom.from, new Date(2026, 10, 1).getTime());
  assert.equal(custom.to, new Date(2026, 10, 20, 23, 59, 59, 999).getTime());
  assert.equal(parseDayInput('2026-02-31'), null);
  assert.equal(formatDay(new Date(2026, 10, 22, 9).getTime()), '2026.11.22.');
});

test('filter keeps createdAt order and drops undated points outside all', () => {
  const bounds = rangeBounds('custom', Date.now(), { from: '2026-11-02', to: '2026-11-03' });
  const result = filterPoints(
    [
      point('c', 'knowledge', at(2026, 11, 3, 8)),
      point('a', 'experience', at(2026, 11, 2, 1)),
      point('old', 'experience', at(2026, 10, 1)),
      point('none', 'knowledge'),
      { id: 'bad', kind: 'knowledge', createdAt: 'yesterday' },
    ],
    bounds
  );
  assert.deepEqual(
    result.points.map((item) => item.id),
    ['a', 'c']
  );
  assert.equal(result.undated, 2);
  const all = filterPoints(
    [point('z', 'knowledge', at(2026, 11, 2)), point('none', 'experience')],
    rangeBounds('all', Date.now())
  );
  assert.deepEqual(
    all.points.map((item) => item.id),
    ['none', 'z']
  );
});

test('diff highlights additions and only marks weakness when a metric exists', () => {
  const points = [
    point('old', 'knowledge', at(2026, 11, 1)),
    point('mid', 'experience', at(2026, 11, 10)),
    point('new', 'pattern', at(2026, 11, 20)),
    point('later', 'knowledge', at(2026, 11, 28)),
  ];
  const plain = diffMemories(points, '2026-11-20', '2026-11-10');
  assert.equal(plain.swapped, true);
  assert.deepEqual(
    plain.added.map((item) => item.id),
    ['mid', 'new']
  );
  assert.deepEqual(
    plain.present.map((item) => item.id),
    ['old', 'mid', 'new']
  );
  assert.equal(plain.additionsOnly, true);
  assert.deepEqual(plain.weakened, []);
  assert.deepEqual(plain.removed, []);

  const weighed = diffMemories(
    [
      point('faded', 'knowledge', at(2026, 11, 1), { decay: 0.4, weight: 0.2 }),
      point('firm', 'knowledge', at(2026, 11, 1, 13), { weight: 0.9, decay: 0 }),
      point('fresh', 'experience', at(2026, 11, 12), { weight: 0.1 }),
    ],
    '2026-11-10',
    '2026-11-15'
  );
  assert.equal(weighed.additionsOnly, false);
  assert.deepEqual(
    weighed.weakened.map((item) => item.id),
    ['faded']
  );
  assert.deepEqual(
    weighed.added.map((item) => item.id),
    ['fresh']
  );
  assert.deepEqual(weighed.removed, []);
});

test('regions accumulate by day and the daily cards keep the four sections', () => {
  const points = [
    point('k1', 'knowledge', at(2026, 11, 1, 1)),
    point('e1', 'experience', at(2026, 11, 1, 2)),
    point('k2', 'knowledge', at(2026, 11, 3, 1)),
    point('d1', 'declaration', at(2026, 11, 3, 2)),
    point('p1', 'pattern', at(2026, 11, 3, 3)),
  ];
  const bounds = rangeBounds('custom', Date.now(), { from: '2026-11-01', to: '2026-11-03' });
  const regions = regionModel(points, bounds);
  assert.deepEqual(regions.kinds, ['knowledge', 'experience', 'declaration', 'pattern']);
  assert.equal(regions.buckets.length, 3);
  assert.equal(regions.buckets[0].counts.knowledge, 1);
  assert.equal(regions.buckets[1].counts.knowledge, 0);
  assert.equal(regions.buckets[2].cumulative.knowledge, 2);
  assert.equal(regions.totals.pattern, 1);
  assert.equal(regions.max, 5);

  const summary = summarizeDays(points, bounds);
  assert.equal(summary.includeEmpty, true);
  assert.equal(summary.cards.length, 3);
  assert.equal(summary.cards[0].day > summary.cards[2].day, true);
  const newest = summary.cards[0];
  assert.equal(newest.sections.find((section) => section.id === 'knowledge').items.length, 1);
  assert.equal(newest.sections.find((section) => section.id === 'reflection').items.length, 0);
  assert.equal(newest.sections.find((section) => section.id === 'behavior').items.length, 1);
  assert.equal(newest.sections.find((section) => section.id === 'user').items.length, 0);
  assert.deepEqual(
    newest.extra.map((group) => group.kind),
    ['declaration']
  );
  const empty = summary.cards.find((card) => card.count === 0);
  assert.ok(empty);

  const all = summarizeDays(points, rangeBounds('all', Date.now()));
  assert.equal(all.omittedEmpty, true);
  assert.equal(
    all.cards.every((card) => card.count > 0),
    true
  );
});

test('kind colors stay hex and differ by kind', () => {
  const knowledge = memoryKindCss('#FFE500', 'knowledge', 'board');
  const experience = memoryKindCss('#FFE500', 'experience', 'board');
  const album = memoryKindCss('#5B4FCF', 'album_moment', 'void');
  assert.match(knowledge, /^#[0-9a-f]{6}$/);
  assert.notEqual(knowledge, experience);
  assert.match(album, /^#[0-9a-f]{6}$/);
  assert.equal(memoryKindCss('nope', 'knowledge', 'board'), '#ffffff');
});
