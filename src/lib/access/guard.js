import { requireLeader } from '../world/auth.js';
import { worldConfig } from '../world/env.js';
import { classify, loginLocation } from './policy.js';

const ROBOTS = 'noindex, nofollow';

export async function guardRequest(request, options = {}) {
  const url = new URL(request.url);
  const decision = classify(url, request.method);
  if (decision.access === 'public' || decision.access === 'cron') return options.next();
  if (decision.access === 'redirect') return denyPage(decision.location);

  const cookies = request.headers.get('cookie') || '';
  const hasSession = /(?:^|;\s*)world_(?:access|refresh)=/.test(cookies);
  if (!hasSession) return deny(decision, url);

  const config = worldConfig(options.env ?? process.env);
  if (!config) return unavailable(decision);

  const leader = await requireLeader(request, config, options);
  if (!leader.ok) {
    if (leader.status === 503) return unavailable(decision, leader.cookies);
    return deny(decision, url, leader.cookies);
  }
  const response = await options.next();
  return stamp(response, leader.cookies);
}

function deny(decision, url, cookies = []) {
  if (decision.api) return json(401, { error: 'unauthorized' }, cookies);
  return denyPage(loginLocation(url), cookies);
}

function denyPage(location, cookies = []) {
  return new Response(null, {
    status: 302,
    headers: headers({ location, 'cache-control': 'no-store' }, cookies),
  });
}

function unavailable(decision, cookies = []) {
  if (decision.api) return json(503, { error: 'unavailable' }, cookies);
  return new Response('Unavailable.', {
    status: 503,
    headers: headers({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, cookies),
  });
}

function json(status, body, cookies) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, cookies),
  });
}

function stamp(response, cookies = []) {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', ROBOTS);
  for (const cookie of cookies ?? []) headers.append('set-cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function headers(extra, cookies = []) {
  const out = new Headers({ 'x-robots-tag': ROBOTS, ...extra });
  for (const cookie of cookies ?? []) out.append('set-cookie', cookie);
  return out;
}
