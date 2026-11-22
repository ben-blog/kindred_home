import assert from 'node:assert/strict';
import test from 'node:test';
import { callFrames, openingFrame, poolFor, suggestFrame } from './expressions.js';

test('expression frames prefer a dropped-in still and a portrait for the mood', () => {
  const gallery = {
    images: [
      { id: 'wide', filename: 'wide.webp', is_active: true, en: { title: 'Wide' } },
      { id: 'face', filename: 'face.webp', is_active: true, en: { title: 'Face' } },
    ],
  };
  const frames = callFrames(gallery, {
    frames: [
      { id: 'wide', emotions: ['calm'], portrait: false },
      {
        id: 'face',
        emotions: ['joy', 'playful'],
        portrait: true,
        src: '/assets/expressions/face-joy.webp',
      },
    ],
  });
  assert.equal(frames[1].src, '/assets/expressions/face-joy.webp');
  assert.equal(frames[1].title, 'Face');
  assert.equal(poolFor(frames, 'joy')[0].id, 'face');
  assert.equal(poolFor(frames, 'sad')[0].id, 'face');
  assert.equal(openingFrame(frames).id, 'wide');

  const seeded = suggestFrame({
    id: 'note',
    filename: 'note.webp',
    en: { description: 'A shy smile, eyes down.' },
  });
  assert.equal(seeded.portrait, true);
  assert.ok(seeded.emotions.includes('shy'));
});
