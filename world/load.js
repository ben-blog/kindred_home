import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collections } from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
export const contentRoot = path.join(repoRoot, 'src', 'content');

export function loadCollections(root = contentRoot) {
  const loaded = {};
  const errors = [];
  for (const [name, config] of Object.entries(collections)) {
    const dir = path.join(root, config.dir);
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
    loaded[name] = [];
    for (const file of files) {
      const full = path.join(dir, file);
      let raw;
      try {
        raw = JSON.parse(readFileSync(full, 'utf8'));
      } catch (error) {
        errors.push(`${config.dir}/${file}: ${error.message}`);
        continue;
      }
      const parsed = config.schema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const at = issue.path.join('.') || '(root)';
          errors.push(`${config.dir}/${file}: ${at}: ${issue.message}`);
        }
        continue;
      }
      const stem = file.replace(/\.json$/, '');
      if (parsed.data[config.idKey] !== stem) {
        errors.push(
          `${config.dir}/${file}: ${config.idKey} "${parsed.data[config.idKey]}" must match the file name`
        );
      }
      loaded[name].push({ file, data: parsed.data });
    }
  }
  return { loaded, errors };
}

export function loadCanon(root = contentRoot) {
  const { loaded, errors } = loadCollections(root);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return {
    world: loaded.world[0]?.data,
    characters: loaded.characters.map((entry) => entry.data),
    locations: loaded.locations.map((entry) => entry.data),
    entities: loaded.entities.map((entry) => entry.data),
    relations: loaded.relations.map((entry) => entry.data),
    sources: loaded.sources.map((entry) => entry.data),
    works: loaded.works.map((entry) => entry.data),
    campaigns: loaded.campaigns.map((entry) => entry.data),
  };
}
