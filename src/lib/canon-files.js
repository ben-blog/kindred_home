import {
  characterSchema,
  entitySchema,
  locationSchema,
  relationSchema,
  sourceSchema,
  worldSchema,
} from '../../world/schema.js';

const worldModules = import.meta.glob('../content/world/*.json', {
  eager: true,
  import: 'default',
});
const characterModules = import.meta.glob('../content/characters/*.json', {
  eager: true,
  import: 'default',
});
const locationModules = import.meta.glob('../content/locations/*.json', {
  eager: true,
  import: 'default',
});
const entityModules = import.meta.glob('../content/entities/*.json', {
  eager: true,
  import: 'default',
});
const relationModules = import.meta.glob('../content/relations/*.json', {
  eager: true,
  import: 'default',
});
const sourceModules = import.meta.glob('../content/sources/*.json', {
  eager: true,
  import: 'default',
});

/** Canon bundled into the server function. A bad file fails closed. */
export function bundledCanon() {
  const worlds = parseAll(worldModules, worldSchema);
  const characters = parseAll(characterModules, characterSchema);
  const locations = parseAll(locationModules, locationSchema);
  const entities = parseAll(entityModules, entitySchema);
  const relations = parseAll(relationModules, relationSchema);
  const sources = parseAll(sourceModules, sourceSchema);
  if (
    !worlds ||
    worlds.length !== 1 ||
    !characters ||
    !locations ||
    !entities ||
    !relations ||
    !sources
  ) {
    return null;
  }
  return {
    world: worlds[0],
    characters,
    locations,
    entities,
    relations,
    sources,
  };
}

function parseAll(modules, schema) {
  const parsed = [];
  for (const value of Object.values(modules)) {
    const raw = value && typeof value === 'object' && value.default ? value.default : value;
    const result = schema.safeParse(raw);
    if (!result.success) return null;
    parsed.push(result.data);
  }
  return parsed;
}
