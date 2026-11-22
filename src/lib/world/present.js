/** Public world view. Visitor identities and the event log stay on the server. */
export function publicState(state) {
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
    pending: Array.isArray(state.pending) ? state.pending.length : 0,
  };
}
