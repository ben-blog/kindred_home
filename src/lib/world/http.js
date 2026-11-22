export const SIGNAL_BODY_LIMIT = 2048;
export const SESSION_BODY_LIMIT = 16 * 1024;

export function json(status, body, extra = {}, cookies = []) {
  const setCookies = Array.isArray(cookies) ? cookies : [];
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function guard(run) {
  try {
    return await run();
  } catch {
    return json(500, { error: 'unavailable' });
  }
}

export async function readJson(request, limit) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 400, error: 'bad request' };
  const declared = request.headers.get('content-length');
  if (declared != null) {
    if (!/^\d+$/.test(declared)) return { status: 400, error: 'bad request' };
    if (Number(declared) > limit) return { status: 413, error: 'too large' };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) return { status: 413, error: 'too large' };
  if (bytes.byteLength === 0) return { status: 400, error: 'bad request' };
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { status: 400, error: 'bad request' };
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { status: 400, error: 'bad request' };
    }
    return { value };
  } catch {
    return { status: 400, error: 'bad request' };
  }
}

export function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match ? match[1] : '';
}

export function corsHeaders(request, sameOrigin) {
  const origin = request.headers.get('origin');
  if (!origin || !sameOrigin(request)) return {};
  return {
    'access-control-allow-origin': origin,
    vary: 'origin',
  };
}
