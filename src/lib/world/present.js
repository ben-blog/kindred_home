/** Public world view. Visitor identities and the event log stay on the server. */
export function publicState(state, extras = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const characters = {};
  for (const [slug, character] of Object.entries(state.characters ?? {})) {
    if (!character || typeof character !== 'object') continue;
    characters[slug] = {
      slug: character.slug,
      status: character.status,
      location: character.location,
      mood: character.mood,
      energy: character.energy,
      xp: character.xp,
      level: character.level,
    };
  }
  const pendingWarmth = Object.fromEntries(Object.keys(characters).map((slug) => [slug, 0]));
  const lastWarmthAt = Object.fromEntries(Object.keys(characters).map((slug) => [slug, null]));
  // Only events actually accepted by the reducer appear in this new tick's log.
  const accepted = extras.preview?.log
    .slice((state.log ?? []).length)
    .filter((event) => event.what !== 'tick');
  for (const event of accepted ?? []) {
    if (event.what !== 'influence') continue;
    pendingWarmth[event.target] += event.payload.amount;
    if (!lastWarmthAt[event.target] || event.at > lastWarmthAt[event.target]) {
      lastWarmthAt[event.target] = event.at;
    }
  }
  const next = extras.preview
    ? Object.fromEntries(
        Object.entries(extras.preview.characters).map(([slug, { mood, energy, xp, level }]) => [
          slug,
          { mood, energy, xp, level },
        ])
      )
    : undefined;
  const rules = Object.fromEntries(
    ['moodMax', 'energyMax', 'moodThreshold', 'energyIdleDecay', 'xpPerLevel'].map((key) => [
      key,
      state.rules[key],
    ])
  );
  return {
    worldId: state.worldId,
    tick: state.tick,
    leaderSlug: state.leaderSlug,
    characters,
    relations: (state.relations ?? []).map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kinds: relation.kinds,
      strength: relation.strength,
      tension: relation.tension ?? null,
    })),
    locations: state.locations ?? [],
    activeLocations: state.activeLocations ?? [],
    pending: accepted?.length ?? (Array.isArray(state.pending) ? state.pending.length : 0),
    ...(next ? { pendingWarmth, lastWarmthAt, next } : {}),
    rules,
  };
}
