import assert from 'node:assert/strict';
import test from 'node:test';
import { characterSchema, localizedSchema, siteSchema } from './schema.js';

test('a localized field requires en and keeps extra locales', () => {
  assert.deepEqual(localizedSchema.parse({ en: 'Hello' }), { en: 'Hello' });
  assert.deepEqual(localizedSchema.parse({ en: 'Hello', ko: '안녕', ja: 'こんにちは' }), {
    en: 'Hello',
    ko: '안녕',
    ja: 'こんにちは',
  });

  const missing = localizedSchema.safeParse({ ko: '안녕' });
  assert.equal(missing.success, false);
  assert.ok(missing.error.issues.some((issue) => issue.message === 'en is required'));

  assert.equal(localizedSchema.safeParse({}).success, false);
  assert.equal(localizedSchema.safeParse({ en: '' }).success, false);
  assert.equal(localizedSchema.safeParse({ en: 'Hello', note: 'not a locale' }).success, false);
});

test('the site locale list must include en and the default', () => {
  assert.deepEqual(siteSchema.parse({ defaultLocale: 'en', locales: ['en'] }).locales, ['en']);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'en', locales: ['ko'] }).success, false);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'ko', locales: ['en'] }).success, false);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'en', locales: ['en', 'ko'] }).success, true);
});

function character(identity, layout) {
  return {
    slug: 'nova',
    status: 'draft',
    name: { en: 'Nova' },
    ...(layout ? { layout } : {}),
    profile: {
      tagline: { en: 'New.' },
      bio: { en: 'A new character.' },
    },
    identity,
    voice: { tone: '' },
    location: 'hall',
    initial: { mood: 1, energy: 1, xp: 0, level: 1 },
  };
}

test('a character with no layout is a sheet and has no mark', () => {
  const parsed = characterSchema.parse(character({ color: '#AABBCC' }));
  assert.equal(parsed.layout, 'sheet');
  assert.equal(parsed.identity.mark, undefined);

  const withMark = characterSchema.safeParse(
    character({ color: '#AABBCC', mark: { type: 'gaze' } }, 'sheet')
  );
  assert.equal(withMark.success, false);
  assert.ok(withMark.error.issues.some((issue) => issue.message === 'a sheet layout has no mark'));
});

test('a board needs a gaze mark and a void needs a room mark', () => {
  const gaze = characterSchema.parse(character({ color: '#FFE500', mark: { type: 'gaze' } }, 'board'));
  assert.equal(gaze.identity.mark.type, 'gaze');
  assert.equal(gaze.identity.mark.delay, 280);
  assert.deepEqual(gaze.identity.mark.easing, [0.87, 0, 0.13, 1]);

  const room = characterSchema.parse(
    character({ color: '#5B4FCF', mark: { type: 'room' } }, 'void')
  );
  assert.equal(room.identity.mark.type, 'room');
  assert.equal(room.identity.mark.drift, 22);
  assert.equal(room.identity.mark.follow, 1.6);
  assert.deepEqual(room.identity.mark.easing, [0.34, 1.56, 0.64, 1]);

  const boardRoom = characterSchema.safeParse(
    character({ color: '#FFE500', mark: { type: 'room' } }, 'board')
  );
  assert.equal(boardRoom.success, false);
  const voidGaze = characterSchema.safeParse(
    character({ color: '#5B4FCF', mark: { type: 'gaze' } }, 'void')
  );
  assert.equal(voidGaze.success, false);
  const bareBoard = characterSchema.safeParse(character({ color: '#FFE500' }, 'board'));
  assert.equal(bareBoard.success, false);

  const blob = characterSchema.safeParse(
    character(
      { color: '#FFE500', mark: { type: 'gaze', points: 6, wobble: 0.08, speed: 1, scatterOnHover: true } },
      'board'
    )
  );
  assert.equal(blob.success, false);
});
