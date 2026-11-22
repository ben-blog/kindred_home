import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createLimiter } from '../proxy.js';
import { handleWorldChat } from './chat.js';

const canon = loadCanon();
const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
  KIN_AGENT_URL: 'https://kin-agent.example.test',
  DRED_AGENT_URL: 'https://dred-agent.example.test',
  KIN_AGENT_TOKEN: 'kin-admin-key-0123456789',
  DRED_AGENT_TOKEN: 'dred-admin-key-0123456789',
};

function request(path, { method = 'POST', body, headers = {}, cookie } = {}) {
  const init = { method, headers: { origin: 'https://kinxdred.com', ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`https://kinxdred.com${path}`, init);
}

function leaderFetch(id, upstream) {
  return async (url, init) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return upstream(href, init);
  };
}

function sse(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function base(extra = {}) {
  return {
    env,
    canon,
    slug: 'kin',
    vitals: { energy: 5, mood: 2 },
    limiter: createLimiter(),
    ...extra,
  };
}

const signedIn = { cookie: 'world_access=leader.access.token' };

test('chat fails closed without the leader session, the agent origin, or the agent token', async () => {
  const closed = await handleWorldChat(request('/api/world/chat/kin', signedIn), {
    canon,
    slug: 'kin',
    env: {},
  });
  assert.equal(closed.status, 503);

  const anonymous = await handleWorldChat(
    request('/api/world/chat/kin', { body: { messages: [{ role: 'user', content: 'hey' }] } }),
    base()
  );
  assert.equal(anonymous.status, 401);

  const stranger = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      fetch: leaderFetch('22222222-2222-4222-8222-222222222222', () => {
        throw new Error('agent should not be called');
      }),
    })
  );
  assert.equal(stranger.status, 403);

  let called = false;
  const missingToken = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      env: { ...env, KIN_AGENT_TOKEN: '' },
      fetch: leaderFetch(leaderId, () => {
        called = true;
        throw new Error('no');
      }),
    })
  );
  assert.equal(missingToken.status, 503);
  assert.equal(called, false);

  const missingOrigin = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      env: { ...env, KIN_AGENT_URL: '' },
      fetch: leaderFetch(leaderId, () => {
        throw new Error('no');
      }),
    })
  );
  assert.equal(missingOrigin.status, 503);
});

test('chat is same-origin, size-capped, and rate limited', async () => {
  const cross = await handleWorldChat(
    request('/api/world/chat/kin', {
      headers: { origin: 'https://evil.example' },
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      fetch: () => {
        throw new Error('should not run');
      },
    })
  );
  assert.equal(cross.status, 403);

  const huge = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'x'.repeat(100_000) }] },
    }),
    base({
      fetch: leaderFetch(leaderId, () => {
        throw new Error('agent should not be called');
      }),
    })
  );
  assert.equal(huge.status, 413);

  const limiter = createLimiter({ limit: 1, windowMs: 60_000 });
  const first = await handleWorldChat(
    request('/api/world/chat/kin'),
    base({ limiter, now: () => 0 })
  );
  assert.equal(first.status, 401);
  const second = await handleWorldChat(
    request('/api/world/chat/kin'),
    base({ limiter, now: () => 10 })
  );
  assert.equal(second.status, 429);
  assert.equal(second.headers.get('retry-after'), '60');
});

test('a character without chat is not routed', async () => {
  const local = structuredClone(canon);
  const kin = local.characters.find((item) => item.slug === 'kin');
  delete kin.agent.chat;
  const gone = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      canon: local,
      fetch: leaderFetch(leaderId, () => {
        throw new Error('no');
      }),
    })
  );
  assert.equal(gone.status, 404);
});

test('the proxy streams the agent reply and stamps an expression', async () => {
  const seen = [];
  const fetch = leaderFetch(leaderId, async (href, init) => {
    seen.push({ href, init });
    assert.equal(href, 'https://kin-agent.example.test/api/kin/chat');
    assert.equal(init.headers.get('x-admin-key'), env.KIN_AGENT_TOKEN);
    assert.equal(init.headers.get('x-trace'), '1');
    assert.equal(init.headers.get('authorization'), `Bearer ${env.KIN_AGENT_TOKEN}`);
    assert.equal(init.headers.get('origin'), null);
    assert.equal(init.headers.get('cookie'), null);
    const body = JSON.parse(init.body);
    assert.equal(body.userId, 'ben');
    assert.equal(body.sessionId, 'session-1');
    assert.equal(body.messages.at(-1).content, 'hey');
    assert.deepEqual(body.currentPlan, { currentGoal: 'listen' });
    return new Response(
      sse([
        'data: {"type":"token","text":"he"}\n\n',
        'data: {"type":"token","text":"y lol"}\n\n',
        'data: {"type":"done","sessionId":"session-1","mood":"laughing","character":"kin","plan":{"currentGoal":"stay"}}\n\n',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } }
    );
  });

  const response = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: {
        sessionId: 'session-1',
        plan: { currentGoal: 'listen' },
        messages: [{ role: 'user', content: 'hey' }],
      },
    }),
    base({ fetch, vitals: { energy: 1, mood: 1 } })
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const text = await response.text();
  assert.equal(text.includes('railway'), false);
  assert.equal(text.includes(env.KIN_AGENT_TOKEN), false);
  assert.equal(text.includes('https://kin-agent.example.test'), false);
  const events = text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data:\s*/, '')));
  assert.deepEqual(events.map((event) => event.text).filter(Boolean), ['he', 'y lol']);
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).expression, 'playful');
  assert.equal(events.at(-1).sessionId, 'session-1');
  assert.deepEqual(events.at(-1).plan, { currentGoal: 'stay' });
  assert.equal(events.at(-1).character, undefined);
  assert.equal(seen.length, 1);
});

test('a split SSE event is reassembled and low energy can settle on tired', async () => {
  const fetch = leaderFetch(leaderId, async () => {
    return new Response(
      sse([
        'data: {"type":"token","text":"ok',
        'ay"}\n\ndata: {"type":"done","emotion":"speaking"}\n\n',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
  });
  const response = await handleWorldChat(
    request('/api/world/chat/dred', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'you around' }] },
    }),
    base({ slug: 'dred', fetch, vitals: { energy: 1, mood: 3 } })
  );
  const text = await response.text();
  const events = text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data:\s*/, '')));
  assert.equal(events[0].text, 'okay');
  assert.equal(events[1].expression, 'tired');
  assert.equal(events[1].userId, undefined);
});

test('a trace event is passed through without the rest of the agent payload', async () => {
  const fetch = leaderFetch(leaderId, async () => {
    return new Response(
      sse([
        'event: trace\ndata: {"stage":"retrieved","items":[{"id":"m1","kind":"experience","label":"the bus","score":0.82,"prompt":"secret"},{"id":"r1","kind":"reflection","label":"a note","score":null}],"system":"hidden"}\n\n',
        'data: {"type":"token","text":"hey"}\n\n',
        'data: {"type":"done","mood":"calm"}\n\n',
        'event: trace\ndata: {"stage":"saved","ids":["m2"]}\n\n',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
  });
  const response = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({ fetch, vitals: { energy: 5, mood: 2 } })
  );
  const events = (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data:\s*/, '')));
  assert.equal(events.length, 3);
  assert.equal(events[0].stage, 'retrieved');
  assert.deepEqual(events[0].items, [
    { id: 'm1', kind: 'experience', label: 'the bus', score: 0.82 },
    { id: 'r1', kind: 'reflection', label: 'a note', score: null },
  ]);
  assert.equal(JSON.stringify(events).includes('secret'), false);
  assert.equal(JSON.stringify(events).includes('saved'), false);
  assert.equal(events[1].text, 'hey');
  assert.equal(events[2].expression, 'calm');
  assert.deepEqual(events[2].world, { mood: 2, energy: 5 });
});

test('web search traces stay in arrival order and keep only a title and an http url', async () => {
  const fetch = leaderFetch(leaderId, async () => {
    return new Response(
      sse([
        'event: trace\ndata: {"stage":"web_search","query":"subculture zines","results":[{"title":"A stack of zines","url":"https://example.com/zines","html":"<script>alert(1)</script>"},{"title":"skip","url":"javascript:alert(1)"}],"secret":"nope"}\n\n',
        'event: trace\ndata: {"stage":"retrieved","items":[{"id":"m1","kind":"knowledge","label":"a zine","score":0.4,"prompt":"secret"}]}\n\n',
        'data: {"type":"token","text":"hey"}\n\n',
        'event: trace\ndata: {"stage":"web_search","query":"later","results":[{"title":"After","url":"http://after.example/x"}]}\n\n',
        'data: {"type":"done","mood":"calm"}\n\n',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
  });
  const response = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({ fetch, vitals: { energy: 5, mood: 2 } })
  );
  const events = (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data:\s*/, '')));
  assert.deepEqual(
    events.map((event) => event.stage || event.type),
    ['web_search', 'retrieved', 'token', 'web_search', 'done']
  );
  assert.deepEqual(events[0], {
    type: 'trace',
    stage: 'web_search',
    query: 'subculture zines',
    results: [{ title: 'A stack of zines', url: 'https://example.com/zines' }],
  });
  assert.equal(events[1].stage, 'retrieved');
  assert.deepEqual(events[1].items, [{ id: 'm1', kind: 'knowledge', label: 'a zine', score: 0.4 }]);
  assert.equal(events[3].query, 'later');
  const text = JSON.stringify(events);
  assert.equal(text.includes('script'), false);
  assert.equal(text.includes('javascript'), false);
  assert.equal(text.includes('secret'), false);
  assert.equal(text.includes('nope'), false);
});

test('forceWebSearch is forwarded only when the leader asks for it', async () => {
  const bodies = [];
  const fetch = leaderFetch(leaderId, async (_href, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(sse(['data: {"type":"done","mood":"calm"}\n\n']), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const on = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }], forceWebSearch: true },
    }),
    base({ fetch })
  );
  assert.equal(on.status, 200);
  assert.equal(bodies[0].forceWebSearch, true);
  assert.equal(bodies[0].userId, 'ben');

  const off = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }], forceWebSearch: false },
    }),
    base({ fetch })
  );
  assert.equal(off.status, 200);
  assert.equal(Object.hasOwn(bodies[1], 'forceWebSearch'), false);

  const bad = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }], forceWebSearch: 'yes' },
    }),
    base({
      fetch: leaderFetch(leaderId, () => {
        throw new Error('agent should not be called');
      }),
    })
  );
  assert.equal(bad.status, 400);
});

test('an upstream failure stays a generic 502', async () => {
  const fetch = leaderFetch(leaderId, async () => {
    return new Response(
      '{"error":"https://secret.railway.app","token":"kin-admin-key-0123456789"}',
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  });
  const response = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({ fetch })
  );
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text, '{"error":"unavailable"}');
  assert.equal(text.includes('railway'), false);
  assert.equal(text.includes('kin-admin-key'), false);
});

test('a long assistant turn in history is clamped and the newest user line stays strict', async () => {
  const seen = [];
  const fetch = leaderFetch(leaderId, async (_href, init) => {
    seen.push(JSON.parse(init.body));
    return new Response(
      sse(['data: {"type":"token","text":"ok"}\n\ndata: {"type":"done","mood":"calm"}\n\n']),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }
    );
  });
  const response = await handleWorldChat(
    request('/api/world/chat/dred', {
      ...signedIn,
      body: {
        messages: [
          { role: 'user', content: 'b'.repeat(2400) },
          { role: 'assistant', content: '가'.repeat(2500) },
          { role: 'assistant', content: '   ' },
          { role: 'user', content: '  still here  ' },
        ],
      },
    }),
    base({ slug: 'dred', fetch })
  );
  assert.equal(response.status, 200);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].messages, [
    { role: 'user', content: 'b'.repeat(2000) },
    { role: 'assistant', content: '가'.repeat(2000) },
    { role: 'user', content: 'still here' },
  ]);

  const many = [];
  for (let index = 0; index < 31; index += 1) {
    many.push({ role: index % 2 === 0 ? 'user' : 'assistant', content: `m${index}` });
  }
  const windowed = await handleWorldChat(
    request('/api/world/chat/dred', { ...signedIn, body: { messages: many } }),
    base({ slug: 'dred', fetch })
  );
  assert.equal(windowed.status, 200);
  assert.equal(seen[1].messages.length, 24);
  assert.equal(seen[1].messages[0].content, 'm7');
  assert.equal(seen[1].messages.at(-1).role, 'user');
  assert.equal(seen[1].messages.at(-1).content, 'm30');

  let called = false;
  const rejected = await handleWorldChat(
    request('/api/world/chat/dred', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
    }),
    base({
      slug: 'dred',
      fetch: leaderFetch(leaderId, () => {
        called = true;
        throw new Error('agent should not be called');
      }),
    })
  );
  assert.equal(rejected.status, 400);
  assert.equal(called, false);
});

test('an upstream timeout is 504 and a streamed error stays a generic event', async () => {
  const timedOut = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({
      fetch: leaderFetch(leaderId, () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    })
  );
  assert.equal(timedOut.status, 504);
  assert.equal(await timedOut.text(), '{"error":"unavailable"}');

  const fetch = leaderFetch(leaderId, async () => {
    return new Response(sse(['data: {"type":"error","message":"credit balance is too low"}\n\n']), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const response = await handleWorldChat(
    request('/api/world/chat/kin', {
      ...signedIn,
      body: { messages: [{ role: 'user', content: 'hey' }] },
    }),
    base({ fetch })
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes('credit'), false);
  assert.match(text, /"type":"error"/);
  assert.match(text, /"message":"unavailable"/);
});
