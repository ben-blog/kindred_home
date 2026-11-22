import { step } from '../../../world/step.js';

/**
 * Feed events the store has not yet consumed, then the leader tick, through step().
 * Records already stamped, or missing a usable time, are skipped. Their seq still advances.
 */
export function reduceTick(state, records, tickEvent) {
  const seen = new Set([
    ...(state.log ?? []).map((entry) => entry.id),
    ...(state.pending ?? []).map((entry) => entry.id),
  ]);
  const pending = [];
  let lastEventSeq = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const seq = Number(record?.seq);
    if (Number.isInteger(seq) && seq > lastEventSeq) lastEventSeq = seq;
    if (!record || seen.has(record.id)) continue;
    const event = toReducerEvent(record);
    if (event) pending.push(event);
  }
  const input = [...pending, tickEvent];
  return { state: step(state, input), input, lastEventSeq };
}

export function leaderTickEvent(state, id, at) {
  return {
    id,
    worldId: state.worldId,
    tick: null,
    at,
    who: state.leaderSlug,
    what: 'tick',
    where: null,
    payload: {},
    source: 'leader',
  };
}

export function normalizeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toReducerEvent(record) {
  if (!record || typeof record !== 'object' || record.what === 'tick') return null;
  const at = normalizeTime(record.at);
  if (!at || typeof record.id !== 'string' || typeof record.who !== 'string') return null;
  const event = {
    id: record.id,
    worldId: record.worldId,
    tick: null,
    at,
    who: record.who,
    what: record.what,
    where: record.where ?? null,
    payload: record.payload && typeof record.payload === 'object' ? record.payload : {},
    source: record.source,
  };
  if (typeof record.target === 'string' && record.target) event.target = record.target;
  return event;
}
