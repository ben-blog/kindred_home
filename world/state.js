/**
 * Build the v0 world state from static canon.
 * Draft characters are left out. Archived characters stay, frozen by `step`.
 * The leader is the entity whose kind is "leader" (Ben, in this world).
 */
export function createState(canon) {
  const leaders = canon.entities.filter((entity) => entity.kind === 'leader' && entity.status !== 'draft');
  if (leaders.length !== 1) {
    throw new Error(`expected one public leader entity, found ${leaders.length}`);
  }
  const leaderSlug = leaders[0].slug;
  const rules = { ...canon.world.rules };
  const locations = canon.locations.map((location) => location.slug);
  const locationSet = new Set(locations);
  const characters = {};

  for (const character of canon.characters) {
    if (character.status === 'draft') continue;
    if (!locationSet.has(character.location)) {
      throw new Error(`unknown location "${character.location}" for ${character.slug}`);
    }
    const expectedLevel = 1 + Math.floor(character.initial.xp / rules.xpPerLevel);
    if (character.initial.level !== expectedLevel) {
      throw new Error(`level for ${character.slug} must be ${expectedLevel}`);
    }
    const leaderKinds = new Set(
      canon.relations
        .filter((relation) => connects(relation, character.slug, leaderSlug))
        .flatMap((relation) => relation.kinds)
    );
    if (!leaderKinds.has('leader') || !leaderKinds.has('friend')) {
      throw new Error(`${character.slug} must include leader and friend with ${leaderSlug}`);
    }
    const lore = character.lore ?? [];
    characters[character.slug] = {
      slug: character.slug,
      status: character.status,
      location: character.location,
      mood: character.initial.mood,
      energy: character.initial.energy,
      xp: character.initial.xp,
      level: character.initial.level,
      lore: lore.map((item) => ({
        id: item.id,
        unlockStage: item.unlock?.stage ?? null,
      })),
      unlocked: lore
        .filter((item) => item.unlock == null || item.unlock.stage <= character.initial.level)
        .map((item) => item.id),
    };
  }

  const live = new Set([
    leaderSlug,
    ...canon.entities.filter((entity) => entity.status !== 'draft').map((entity) => entity.slug),
  ]);

  const relations = canon.relations
    .filter((relation) => live.has(relation.from) && live.has(relation.to))
    .filter((relation) => characters[relation.from] || characters[relation.to] || relation.from === leaderSlug || relation.to === leaderSlug)
    .map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kinds: [...relation.kinds],
      strength: relation.strength,
      tension: relation.kinds.includes('썸') ? relation.tension : null,
    }));

  return {
    worldId: canon.world.id,
    tick: canon.world.tick,
    leaderSlug,
    rules,
    characters,
    locations,
    relations,
    sources: canon.sources.map((source) => ({
      id: source.id,
      scope: source.scope,
      character: source.character ?? null,
      category: source.category,
      kinds: [...source.kinds],
      fetch: source.fetch,
    })),
    pending: [],
    log: [],
    activeLocations: [],
  };
}

export function connects(relation, a, b) {
  return (relation.from === a && relation.to === b) || (relation.from === b && relation.to === a);
}
