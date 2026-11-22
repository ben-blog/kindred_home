import { eventSchema } from './schema.js';
import { connects } from './state.js';

/**
 * Pure reducer. `step(state, events) -> state`.
 *
 * Visitors, agents, and external sources only enqueue events. Character
 * stats, relations, and the tick counter change when the leader (Ben) sends
 * `what: "tick"`. Time is that tick, not the wall clock. Archived characters
 * stay as they are. Invalid events are ignored.
 *
 * Replay the original stream (queued events have `tick: null`). Events that
 * already carry a tick number are archive records and are not applied again.
 */
export function step(state, events) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('state must be an object');
  }
  if (!Array.isArray(events)) {
    throw new TypeError('events must be an array');
  }

  const next = structuredClone(state);
  for (const raw of events) {
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.worldId !== next.worldId) continue;
    if (event.what === 'tick') {
      applyTick(next, event);
      continue;
    }
    if (event.tick !== null) continue;
    const queued = normalizeQueued(next, event);
    if (queued) next.pending.push(queued);
  }
  return next;
}

/** Where a character is after the latest applied tick. Unknown slugs return null. */
export function whereIs(state, slug) {
  return state.characters[slug]?.location ?? null;
}

function normalizeQueued(state, event) {
  if (event.what === 'influence') return normalizeInfluence(state, event);
  if (event.what === 'agent_action') return normalizeAgent(state, event);
  if (event.what === 'external') return normalizeExternal(state, event);
  return null;
}

function normalizeInfluence(state, event) {
  if (event.source !== 'visitor-influence') return null;
  const character = state.characters[event.target];
  if (!character || character.status !== 'active') return null;
  if (event.payload.kind !== 'warmth') return null;
  const amount = event.payload.amount == null ? 1 : event.payload.amount;
  if (!isPositiveAmount(amount) || amount > state.rules.maxInfluencePerEvent) return null;
  return cloneEvent(event, { kind: 'warmth', amount });
}

function normalizeAgent(state, event) {
  if (event.source !== 'agent') return null;
  const character = state.characters[event.target];
  if (!character || character.status !== 'active') return null;
  const action = event.payload.action;
  if (action === 'note') return cloneEvent(event, event.payload);
  if (action === 'move' && state.locations.includes(event.payload.location)) {
    return cloneEvent(event, event.payload);
  }
  return null;
}

function normalizeExternal(state, event) {
  if (event.source !== 'external') return null;
  const category = event.payload.category;
  const kind = event.payload.kind;
  if (typeof category !== 'string' || typeof kind !== 'string') return null;
  const source = state.sources.find(
    (item) => item.category === category && item.kinds.includes(kind) && item.fetch === false
  );
  if (!source) return null;
  if (source.scope === 'shared') {
    if (event.target != null && event.target !== state.worldId) return null;
    return cloneEvent(event, event.payload);
  }
  if (event.target !== source.character) return null;
  if (state.characters[event.target]?.status !== 'active') return null;
  return cloneEvent(event, event.payload);
}

function applyTick(state, event) {
  if (event.who !== state.leaderSlug || event.source !== 'leader') return;

  const pending = state.pending;
  state.pending = [];
  state.tick += 1;

  const warmth = Object.fromEntries(Object.keys(state.characters).map((slug) => [slug, 0]));
  for (const item of pending) {
    if (item.what !== 'influence') continue;
    const character = state.characters[item.target];
    if (!character || character.status !== 'active') continue;
    warmth[item.target] += item.payload.amount;
  }

  for (const slug of Object.keys(state.characters)) {
    const character = state.characters[slug];
    if (character.status !== 'active') continue;
    const amount = warmth[slug];
    if (amount >= state.rules.moodThreshold && character.mood < state.rules.moodMax) {
      character.mood += 1;
    }
    character.energy =
      amount === 0
        ? Math.max(0, character.energy - state.rules.energyIdleDecay)
        : Math.min(state.rules.energyMax, character.energy + amount);
    character.xp += amount;
    const level = 1 + Math.floor(character.xp / state.rules.xpPerLevel);
    if (level > character.level) {
      for (const lore of character.lore) {
        if (lore.unlockStage != null && lore.unlockStage <= level && !character.unlocked.includes(lore.id)) {
          character.unlocked.push(lore.id);
        }
      }
      character.level = level;
    }
    if (amount > 0) {
      for (const relation of state.relations) {
        if (!connects(relation, slug, state.leaderSlug)) continue;
        relation.strength = Math.min(state.rules.relationMax, relation.strength + 1);
      }
    }
  }

  for (const relation of state.relations) {
    if (!relation.kinds.includes('썸') || relation.tension == null) continue;
    const touched =
      warmthOf(warmth, relation.from, state.leaderSlug) > 0 ||
      warmthOf(warmth, relation.to, state.leaderSlug) > 0;
    if (touched) relation.tension = Math.min(state.rules.tensionMax, relation.tension + 1);
  }

  const warmed = new Set(Object.keys(warmth).filter((slug) => warmth[slug] > 0));
  for (const relation of state.relations) {
    if (relation.from === state.leaderSlug || relation.to === state.leaderSlug) continue;
    if (warmed.has(relation.from) && warmed.has(relation.to)) {
      relation.strength = Math.min(state.rules.relationMax, relation.strength + 1);
    }
  }

  for (const item of pending) {
    if (item.what !== 'agent_action' || item.payload.action !== 'move') continue;
    const character = state.characters[item.target];
    if (!character || character.status !== 'active') continue;
    if (state.locations.includes(item.payload.location)) character.location = item.payload.location;
  }

  const activeLocations = [];
  for (const slug of Object.keys(state.characters).sort()) {
    const character = state.characters[slug];
    if (character.status !== 'active' || warmth[slug] <= 0) continue;
    if (!activeLocations.includes(character.location)) activeLocations.push(character.location);
  }
  state.activeLocations = activeLocations;

  state.log.push(
    {
      id: event.id,
      worldId: state.worldId,
      tick: state.tick,
      at: event.at,
      who: event.who,
      what: 'tick',
      where: event.where ?? null,
      payload: structuredClone(event.payload),
      source: event.source,
    },
    ...pending.map((item) => ({ ...item, tick: state.tick }))
  );
}

function warmthOf(warmth, slug, leaderSlug) {
  if (slug === leaderSlug) return 0;
  return warmth[slug] ?? 0;
}

function isPositiveAmount(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

function cloneEvent(event, payload) {
  return {
    id: event.id,
    worldId: event.worldId,
    tick: null,
    at: event.at,
    who: event.who,
    what: event.what,
    where: event.where ?? null,
    target: event.target,
    payload: structuredClone(payload),
    source: event.source,
  };
}
