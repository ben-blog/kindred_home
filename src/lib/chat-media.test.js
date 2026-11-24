import test from 'node:test';
import assert from 'node:assert/strict';
import { chatMedia } from './chat-media.js';
test('media rejects unsafe URLs and ignores extra agent fields', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png', 'https://a:b@example.com', ''])
    assert.equal(chatMedia({ url }), null);
  assert.deepEqual(
    chatMedia({
      url: 'https://example.com/p.png',
      alt: 'rain',
      width: 600,
      height: 800,
      token: 'private',
    }),
    { url: 'https://example.com/p.png', alt: 'rain', width: 600, height: 800 }
  );
});
