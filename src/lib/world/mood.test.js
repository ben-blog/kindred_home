import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyText, mapAgentLabel, resolveExpression } from './mood.js';

test('agent labels and reply text map onto the call expressions', () => {
  assert.equal(mapAgentLabel('laughing'), 'playful');
  assert.equal(mapAgentLabel('flustered'), 'shy');
  assert.equal(mapAgentLabel('speaking'), 'calm');
  assert.equal(mapAgentLabel('nope'), null);
  assert.equal(classifyText('hahaha wait'), 'playful');
  assert.equal(classifyText('this is quiet'), 'calm');
  assert.equal(classifyText('...'), null);

  assert.equal(resolveExpression({ text: 'hey', agentLabel: 'laughing', energy: 1 }), 'playful');
  assert.equal(
    resolveExpression({ text: 'okay', agentLabel: 'speaking', energy: 1, mood: 4 }),
    'tired'
  );
  assert.equal(
    resolveExpression({ text: 'hello', agentLabel: 'default', energy: 6, mood: 0 }),
    'sad'
  );
  assert.equal(resolveExpression({ text: '', energy: 8, mood: 3 }), 'calm');
});
