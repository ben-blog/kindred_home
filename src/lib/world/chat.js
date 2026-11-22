import { upstreamTokens, clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { requireLeader } from './auth.js';
import { httpsOrigin, worldConfig } from './env.js';
import { corsHeaders, guard, json, readJson } from './http.js';
import { parseTrace } from './memory.js';
import { resolveExpression } from './mood.js';
import { createWorldStore } from './store.js';

export const CHAT_BODY_LIMIT = 96 * 1024;
export const CHAT_RATE_LIMIT = 20;
export const CHAT_RATE_WINDOW_MS = 60_000;
export const CHAT_TIMEOUT_MS = 55_000;
const MAX_MESSAGES = 24;
const MAX_TEXT = 2000;
const MAX_PLAN = 4000;
const SESSION = /^[a-zA-Z0-9-]{1,64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const CHAT_PATH = /^\/api\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/;

const sharedLimiter = createLimiter({ limit: CHAT_RATE_LIMIT, windowMs: CHAT_RATE_WINDOW_MS });

export function chatRoutes(characters) {
  const routes = new Map();
  for (const character of Array.isArray(characters) ? characters : []) {
    const route = routeFrom(character);
    if (!route || routes.has(route.slug)) continue;
    routes.set(route.slug, route);
  }
  return routes;
}

export function handleWorldChat(request, options = {}) {
  return guard(() => dispatch(request, options));
}

async function dispatch(request, options) {
  const env = options.env ?? process.env;
  const config = worldConfig(env);
  if (!config) return json(503, { error: 'unavailable' });
  const canon = options.canon;
  if (!canon?.world?.id || !Array.isArray(canon.characters)) {
    return json(503, { error: 'unavailable' });
  }
  const cors = corsHeaders(request, sameOrigin);

  if (request.method === 'OPTIONS') {
    if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        'cache-control': 'no-store',
      },
    });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'method not allowed' }, { allow: 'POST', ...cors });
  }
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });

  const limiter = options.limiter ?? sharedLimiter;
  const now = options.now ?? Date.now;
  const ip = clientAddress(request);
  if (!limiter.allow(ip, now())) {
    return json(429, { error: 'too many requests' }, { 'retry-after': '60', ...cors });
  }

  const leader = await requireLeader(request, config, options);
  if (!leader.ok) {
    return json(leader.status, { error: leader.error }, cors, leader.cookies ?? []);
  }

  const slug = typeof options.slug === 'string' ? options.slug : '';
  if (!SLUG.test(slug)) return json(404, { error: 'not found' }, cors, leader.cookies);
  const route = chatRoutes(canon.characters).get(slug);
  if (!route) return json(404, { error: 'not found' }, cors, leader.cookies);

  const origin = httpsOrigin(env[route.upstream]);
  const token = env[route.token];
  if (!origin || typeof token !== 'string' || !TOKEN.test(token)) {
    return json(503, { error: 'unavailable' }, cors, leader.cookies);
  }

  const read = await readJson(request, CHAT_BODY_LIMIT);
  if (read.error) return json(read.status, { error: read.error }, cors, leader.cookies);
  const parsed = normalizeChat(read.value);
  if (!parsed) return json(400, { error: 'bad request' }, cors, leader.cookies);

  const payload = { messages: parsed.messages };
  if (parsed.sessionId) payload.sessionId = parsed.sessionId;
  if (route.chatUser) payload.userId = route.chatUser;
  if (parsed.plan) payload.currentPlan = parsed.plan;

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const vitals = await readVitals(options, config, canon, slug, fetchImpl);
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('accept', 'text/event-stream');
  headers.set('authorization', `Bearer ${token}`);
  headers.set('x-admin-key', token);
  headers.set('x-trace', '1');

  let upstream;
  try {
    upstream = await fetchImpl(`${origin}${route.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? CHAT_TIMEOUT_MS),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return json(502, { error: 'unavailable' }, cors, leader.cookies);
  }

  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !upstream.body || !type.includes('text/event-stream')) {
    await upstream.body?.cancel().catch(() => {});
    return json(502, { error: 'unavailable' }, cors, leader.cookies);
  }

  const responseHeaders = new Headers({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
    ...cors,
  });
  for (const cookie of leader.cookies ?? []) responseHeaders.append('set-cookie', cookie);
  return new Response(rewriteSse(upstream.body, vitals), { status: 200, headers: responseHeaders });
}

function routeFrom(character) {
  if (!character || (character.status !== 'active' && character.status !== 'archived')) return null;
  const agent = character.agent;
  if (!agent || typeof agent.chat !== 'string' || !CHAT_PATH.test(agent.chat)) return null;
  if (!Object.hasOwn(upstreamTokens, agent.upstream)) return null;
  if (typeof character.slug !== 'string' || !SLUG.test(character.slug)) return null;
  if (!agent.chat.startsWith(`/api/${character.slug}/`)) return null;
  const chatUser = typeof agent.chatUser === 'string' ? agent.chatUser : '';
  return {
    slug: character.slug,
    upstream: agent.upstream,
    token: upstreamTokens[agent.upstream],
    path: agent.chat,
    memory: memoryPath(character.slug, agent.memory),
    chatUser,
  };
}

function memoryPath(slug, value) {
  if (typeof value !== 'string' || !CHAT_PATH.test(value)) return '';
  if (!value.startsWith(`/api/${slug}/`)) return '';
  return value;
}

function normalizeChat(body) {
  const keys = Object.keys(body);
  if (
    !keys.includes('messages') ||
    keys.some((key) => !['messages', 'sessionId', 'plan'].includes(key))
  ) {
    return null;
  }
  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    body.messages.length > MAX_MESSAGES
  ) {
    return null;
  }
  const messages = [];
  for (const message of body.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    if (Object.keys(message).some((key) => key !== 'role' && key !== 'content')) return null;
    if (message.role !== 'user' && message.role !== 'assistant') return null;
    if (typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content || content.length > MAX_TEXT) return null;
    messages.push({ role: message.role, content });
  }
  if (messages[messages.length - 1].role !== 'user') return null;
  let sessionId = '';
  if (body.sessionId != null) {
    if (typeof body.sessionId !== 'string' || !SESSION.test(body.sessionId)) return null;
    sessionId = body.sessionId;
  }
  let plan;
  if (body.plan != null) {
    if (!body.plan || typeof body.plan !== 'object' || Array.isArray(body.plan)) return null;
    let encoded;
    try {
      encoded = JSON.stringify(body.plan);
    } catch {
      return null;
    }
    if (encoded.length > MAX_PLAN) return null;
    plan = JSON.parse(encoded);
  }
  return { messages, sessionId, plan };
}

async function readVitals(options, config, canon, slug, fetchImpl) {
  if (options.vitals) return numbersOf(options.vitals);
  try {
    const store = options.store ?? createWorldStore(config, fetchImpl);
    const row = await store.latest(canon.world.id);
    return numbersOf(row?.state?.characters?.[slug]);
  } catch {
    return {};
  }
}

function numbersOf(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  if (typeof value.energy === 'number' && Number.isFinite(value.energy)) out.energy = value.energy;
  if (typeof value.mood === 'number' && Number.isFinite(value.mood)) out.mood = value.mood;
  return out;
}

export function rewriteSse(body, vitals = {}) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const state = { reply: '', ...numbersOf(vitals) };
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const write = (block) => {
        const encoded = renderBlock(block, state);
        if (encoded) controller.enqueue(encoder.encode(encoded));
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) write(part);
        }
        buffer += decoder.decode();
        if (buffer.trim()) write(buffer);
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'unavailable' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });
}

function renderBlock(block, state) {
  const lines = block
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const eventName =
    lines
      .find((item) => item.startsWith('event:'))
      ?.slice(6)
      .trim() || '';
  const line = lines.find((item) => item.startsWith('data:'));
  if (!line) return '';
  let data;
  try {
    data = JSON.parse(line.slice(line.indexOf(':') + 1).trim());
  } catch {
    return '';
  }
  if (!data || typeof data !== 'object') return '';
  if (data.type === 'token' && typeof data.text === 'string') {
    state.reply += data.text;
    return `data: ${JSON.stringify({ type: 'token', text: data.text })}\n\n`;
  }
  if (data.type === 'done') {
    const agentLabel = data.mood || data.emotion || '';
    const expression = resolveExpression({
      text: state.reply,
      agentLabel,
      energy: state.energy,
      mood: state.mood,
    });
    const done = { type: 'done', expression };
    if (state.mood != null || state.energy != null) {
      done.world = {};
      if (state.mood != null) done.world.mood = state.mood;
      if (state.energy != null) done.world.energy = state.energy;
    }
    if (typeof data.sessionId === 'string' && SESSION.test(data.sessionId))
      done.sessionId = data.sessionId;
    if (data.plan && typeof data.plan === 'object' && !Array.isArray(data.plan)) {
      const encoded = JSON.stringify(data.plan);
      if (encoded.length <= MAX_PLAN) done.plan = JSON.parse(encoded);
    }
    return `data: ${JSON.stringify(done)}\n\n`;
  }
  if (data.type === 'error') {
    return `data: ${JSON.stringify({ type: 'error', message: 'unavailable' })}\n\n`;
  }
  if (eventName === 'trace' || data.type === 'trace' || data.stage) {
    const trace = parseTrace(data);
    if (!trace) return '';
    return `data: ${JSON.stringify(trace)}\n\n`;
  }
  return '';
}
