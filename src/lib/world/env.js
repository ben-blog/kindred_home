const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[\x21-\x7E]{16,4096}$/;
const KEY = /^[\x21-\x7E]{20,4096}$/;

/** https origin only. No path, query, user, or hash. */
export function httpsOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!url.hostname) return null;
  return url.origin;
}

/**
 * Every world endpoint needs the full set. A missing or unsafe value fails closed.
 * The anon key stays on the server; the browser never receives it.
 */
export function worldConfig(env = process.env) {
  const url = httpsOrigin(env?.WORLD_SUPABASE_URL);
  const serviceKey = env?.WORLD_SUPABASE_SERVICE_KEY;
  const anonKey = env?.WORLD_SUPABASE_ANON_KEY;
  const leaderId = env?.WORLD_LEADER_USER_ID;
  const ipSalt = env?.WORLD_IP_SALT;
  const cronSecret = env?.CRON_SECRET;
  if (!url) return null;
  if (!isKey(serviceKey) || !isKey(anonKey) || serviceKey === anonKey) return null;
  if (typeof leaderId !== 'string' || !UUID.test(leaderId)) return null;
  if (!isSecret(ipSalt) || !isSecret(cronSecret)) return null;
  if (cronSecret === serviceKey || cronSecret === anonKey) return null;
  return {
    url,
    serviceKey,
    anonKey,
    leaderId: leaderId.toLowerCase(),
    ipSalt,
    cronSecret,
  };
}

function isKey(value) {
  return typeof value === 'string' && KEY.test(value);
}

function isSecret(value) {
  return typeof value === 'string' && SECRET.test(value);
}
