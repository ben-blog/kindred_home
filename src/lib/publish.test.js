import assert from 'node:assert/strict';
import test from 'node:test';
import { compareEntries, isPublicStatus, worksForCharacter } from './publish.js';

test('draft entries stay unpublished', () => {
  assert.equal(isPublicStatus('active'), true);
  assert.equal(isPublicStatus('archived'), true);
  assert.equal(isPublicStatus('draft'), false);
});

test('works follow scope instead of a fixed cast', () => {
  const works = [
    { data: { slug: 'solo', status: 'active', scope: 'character', characters: ['alpha'] } },
    { data: { slug: 'shared', status: 'active', scope: 'shared', characters: [] } },
    { data: { slug: 'secret', status: 'draft', scope: 'shared', characters: [] } },
  ];
  assert.deepEqual(
    worksForCharacter('beta', works).map((work) => work.data.slug),
    ['shared']
  );
  assert.deepEqual(
    worksForCharacter('alpha', works).map((work) => work.data.slug),
    ['solo', 'shared']
  );
});

test('active entries sort ahead of archived ones', () => {
  const entries = [
    { data: { slug: 'b', status: 'archived' } },
    { data: { slug: 'a', status: 'active' } },
  ];
  assert.deepEqual(entries.sort(compareEntries).map((entry) => entry.data.slug), ['a', 'b']);
});
