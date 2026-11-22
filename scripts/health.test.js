import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, prerender } from '../src/pages/api/health.js';

test('/api/health is an on-demand JSON function', async () => {
  assert.equal(prerender, false);
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { ok: true });
});
