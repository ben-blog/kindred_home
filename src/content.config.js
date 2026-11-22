import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { collections as schemas } from '../world/schema.js';

function jsonCollection(name) {
  const config = schemas[name];
  return defineCollection({
    loader: glob({ pattern: '**/*.json', base: `./src/content/${config.dir}` }),
    schema: config.schema,
  });
}

export const collections = {
  characters: jsonCollection('characters'),
  world: jsonCollection('world'),
  locations: jsonCollection('locations'),
  entities: jsonCollection('entities'),
  relations: jsonCollection('relations'),
  sources: jsonCollection('sources'),
  works: jsonCollection('works'),
  campaigns: jsonCollection('campaigns'),
};
