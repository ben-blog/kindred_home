const TIMEOUT_MS = 8000;
const MAX_RESPONSE = 1_000_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID = /^[A-Za-z0-9:._-]{1,180}$/;
/** Influence reads for the leader chat. `who` and `ip_hash` stay out of the row. */
const INFLUENCE_COLUMNS = 'seq,id,at,target,payload,source,what';

function requireSlug(value) {
  if (typeof value !== 'string' || !SLUG.test(value)) throw new Error('store');
}

export function createWorldStore(config, fetchImpl = globalThis.fetch) {
  const headers = {
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };

  async function rpc(name, args) {
    return request(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
  }

  async function request(url, init) {
    const response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.byteLength > MAX_RESPONSE) {
      throw new Error('store');
    }
    if (bytes.byteLength === 0) return null;
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new Error('store');
    }
  }

  return {
    async recentWarmth({ ipHash, target, since }) {
      const query = new URLSearchParams({
        select: 'id',
        limit: '1',
        ip_hash: `eq.${ipHash}`,
        target: `eq.${target}`,
        source: 'eq.visitor-influence',
        created_at: `gt.${since}`,
      });
      const rows = await request(`${config.url}/rest/v1/world_events?${query}`, {
        method: 'GET',
        headers,
      });
      return Array.isArray(rows) && rows.length > 0;
    },
    async findEvent(id) {
      if (typeof id !== 'string' || !EVENT_ID.test(id)) throw new Error('store');
      const query = new URLSearchParams({
        select: INFLUENCE_COLUMNS,
        id: `eq.${id}`,
        limit: '1',
      });
      const rows = await request(`${config.url}/rest/v1/world_events?${query}`, {
        method: 'GET',
        headers,
      });
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const row = rows[0];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      return row;
    },
    async listPendingInfluence(worldId, target, afterSeq) {
      requireSlug(worldId);
      requireSlug(target);
      const seq = Number.isInteger(afterSeq) && afterSeq >= 0 ? afterSeq : 0;
      const query = new URLSearchParams({
        select: INFLUENCE_COLUMNS,
        world_id: `eq.${worldId}`,
        what: 'eq.influence',
        target: `eq.${target}`,
        seq: `gt.${seq}`,
        order: 'seq.asc',
        limit: '500',
      });
      const rows = await request(`${config.url}/rest/v1/world_events?${query}`, {
        method: 'GET',
        headers,
      });
      return Array.isArray(rows) ? rows : [];
    },
    append(event) {
      return rpc('world_append_event', {
        p_id: event.id,
        p_world_id: event.worldId,
        p_at: event.at,
        p_who: event.who,
        p_what: event.what,
        p_place: event.where ?? null,
        p_target: event.target ?? null,
        p_payload: event.payload ?? {},
        p_source: event.source,
        p_ip_hash: event.ipHash ?? null,
      });
    },
    begin(worldId) {
      return rpc('world_begin_tick', { p_world_id: worldId });
    },
    commit(args) {
      return rpc('world_commit_tick', {
        p_world_id: args.worldId,
        p_token: args.token,
        p_before: args.before ?? null,
        p_tick: args.tick ?? null,
        p_state: args.state ?? null,
        p_last_event_seq: args.lastEventSeq ?? null,
        p_input_events: args.input ?? null,
      });
    },
    abort(worldId, token) {
      return rpc('world_commit_tick', {
        p_world_id: worldId,
        p_token: token,
        p_before: null,
        p_tick: null,
        p_state: null,
        p_last_event_seq: null,
        p_input_events: null,
      });
    },
    async latest(worldId) {
      const rows = await request(
        `${config.url}/rest/v1/world_snapshots?select=tick,state,last_event_seq&world_id=eq.${encodeURIComponent(worldId)}&order=tick.desc&limit=1`,
        { method: 'GET', headers }
      );
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const row = rows[0];
      if (!row || typeof row.state !== 'object' || Array.isArray(row.state)) return null;
      return row;
    },
    async recordRun(row) {
      await request(`${config.url}/rest/v1/world_source_runs`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=minimal' },
        body: JSON.stringify({
          world_id: row.worldId,
          source_id: row.sourceId,
          ok: row.ok,
          appended: row.appended,
          detail: row.detail ?? {},
        }),
      });
    },
  };
}
