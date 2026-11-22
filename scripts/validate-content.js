import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { vercelRedirects, vercelRewrites } from '../routing/legacy.js';
import { site } from '../src/config/site.js';
import { loadCollections, repoRoot } from '../world/load.js';
import { siteSchema } from '../world/schema.js';

const errors = [];
const { loaded, errors: schemaErrors } = loadCollections();
errors.push(...schemaErrors);

const characters = dataOf(loaded.characters);
const agentPaths = new Map();
const worlds = dataOf(loaded.world);
const locations = dataOf(loaded.locations);
const entities = dataOf(loaded.entities);
const relations = dataOf(loaded.relations);
const sources = dataOf(loaded.sources);
const works = dataOf(loaded.works);
const campaigns = dataOf(loaded.campaigns);

if (worlds.length !== 1) errors.push(`world: expected one world, found ${worlds.length}`);
const world = worlds[0];
const rules = world?.rules;
const leaders = entities.filter((entity) => entity.kind === 'leader');
if (leaders.length !== 1) errors.push(`entities: expected one leader, found ${leaders.length}`);
const leader = leaders[0];

const bySlug = (list) => new Map(list.map((item) => [item.slug ?? item.id, item]));
const characterBySlug = bySlug(characters);
const locationBySlug = bySlug(locations);
const entityBySlug = bySlug(entities);
const workBySlug = bySlug(works);

for (const character of characters) {
  const entity = entityBySlug.get(character.slug);
  if (!entity || entity.kind !== 'character') {
    errors.push(`characters/${character.slug}: missing a character entity with the same slug`);
  } else if (entity.status !== character.status) {
    errors.push(`characters/${character.slug}: entity status is ${entity.status}`);
  }
  if (!locationBySlug.has(character.location)) {
    errors.push(`characters/${character.slug}: unknown location ${character.location}`);
  }
  for (const alias of character.aliases) {
    if (!publicPathExists(alias))
      errors.push(`characters/${character.slug}: alias ${alias} has no page`);
  }
  if (rules) {
    if (character.initial.mood > rules.moodMax) {
      errors.push(`characters/${character.slug}: mood exceeds moodMax`);
    }
    if (character.initial.energy > rules.energyMax) {
      errors.push(`characters/${character.slug}: energy exceeds energyMax`);
    }
    const level = 1 + Math.floor(character.initial.xp / rules.xpPerLevel);
    if (character.initial.level !== level) {
      errors.push(`characters/${character.slug}: level must be ${level}`);
    }
  }
  const leaderRelation = relations.find((relation) =>
    connects(relation, character.slug, leader?.slug)
  );
  if (!leader || !leaderRelation) {
    errors.push(`characters/${character.slug}: needs a relation to the leader`);
  } else if (!leaderRelation.kinds.includes('leader') || !leaderRelation.kinds.includes('friend')) {
    errors.push(`characters/${character.slug}: leader relation must include leader and friend`);
  }
  for (const listed of character.relationships) {
    const relation = relations.find((item) => connects(item, character.slug, listed.with));
    if (!relation) {
      errors.push(
        `characters/${character.slug}: relationship with ${listed.with} has no relation file`
      );
      continue;
    }
    if (!sameSet(relation.kinds, listed.kinds)) {
      errors.push(
        `characters/${character.slug}: kinds for ${listed.with} differ from the relation file`
      );
    }
    if ((listed.tension ?? null) !== (relation.tension ?? null)) {
      errors.push(
        `characters/${character.slug}: tension for ${listed.with} differs from the relation file`
      );
    }
  }
  if (character.agent) {
    const previous = agentPaths.get(character.agent.path);
    if (previous) {
      errors.push(
        `characters/${character.slug}: agent path ${character.agent.path} is also used by ${previous}`
      );
    } else {
      agentPaths.set(character.agent.path, character.slug);
    }
  }
  for (const workSlug of character.works) {
    const work = workBySlug.get(workSlug);
    if (!work) errors.push(`characters/${character.slug}: unknown work ${workSlug}`);
    else if (work.scope === 'character' && !work.characters.includes(character.slug)) {
      errors.push(`works/${workSlug}: does not list ${character.slug}`);
    }
  }
}

for (const work of works) {
  const entity = entityBySlug.get(work.slug);
  if (!entity || entity.kind !== 'work') errors.push(`works/${work.slug}: missing a work entity`);
  else if (entity.status !== work.status) errors.push(`works/${work.slug}: entity status differs`);
  for (const slug of work.characters) {
    if (!characterBySlug.has(slug)) errors.push(`works/${work.slug}: unknown character ${slug}`);
    const character = characterBySlug.get(slug);
    if (work.status !== 'draft' && character?.status === 'draft') {
      errors.push(`works/${work.slug}: public work lists draft character ${slug}`);
    }
    if (character && work.scope === 'character' && !character.works.includes(work.slug)) {
      errors.push(`characters/${slug}: missing work ${work.slug}`);
    }
  }
  if (work.external) {
    if (!rewriteCovers(work.url))
      errors.push(`works/${work.slug}: external url ${work.url} is not rewritten`);
  } else if (!publicPathExists(work.url)) {
    errors.push(`works/${work.slug}: url ${work.url} has no page`);
  }
}

for (const relation of relations) {
  if (!entityBySlug.has(relation.from))
    errors.push(`relations/${relation.id}: unknown from ${relation.from}`);
  if (!entityBySlug.has(relation.to))
    errors.push(`relations/${relation.id}: unknown to ${relation.to}`);
  if (rules && relation.strength > rules.relationMax) {
    errors.push(`relations/${relation.id}: strength exceeds relationMax`);
  }
  if (rules && relation.tension != null && relation.tension > rules.tensionMax) {
    errors.push(`relations/${relation.id}: tension exceeds tensionMax`);
  }
  for (const slug of [relation.from, relation.to]) {
    const character = characterBySlug.get(slug);
    if (!character) continue;
    const other = relation.from === slug ? relation.to : relation.from;
    const listed = character.relationships.find((item) => item.with === other);
    if (!listed) errors.push(`characters/${slug}: missing relationship for ${relation.id}`);
  }
}

for (const source of sources) {
  if (source.scope === 'character' && !characterBySlug.has(source.character)) {
    errors.push(`sources/${source.id}: unknown character ${source.character}`);
  }
}

for (const campaign of campaigns) {
  if (campaign.end < campaign.start) errors.push(`campaigns/${campaign.slug}: end is before start`);
  for (const slug of campaign.characters) {
    if (!characterBySlug.has(slug))
      errors.push(`campaigns/${campaign.slug}: unknown character ${slug}`);
  }
}

checkGallery('kindred_gallery_kin.json');
checkGallery('kindred_gallery_dred.json');
checkJsonLinks('main-actions.json');

const parsedSite = siteSchema.safeParse(site);
if (!parsedSite.success) {
  for (const issue of parsedSite.error.issues) {
    const at = issue.path.join('.') || '(root)';
    errors.push(`src/config/site.js: ${at}: ${issue.message}`);
  }
}

const vercelPath = path.join(repoRoot, 'vercel.json');
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
if (JSON.stringify(vercel.redirects) !== JSON.stringify(vercelRedirects)) {
  errors.push('vercel.json redirects drifted from routing/legacy.js');
}
if (JSON.stringify(vercel.rewrites) !== JSON.stringify(vercelRewrites)) {
  errors.push('vercel.json rewrites drifted from routing/legacy.js');
}
if (vercel.outputDirectory || vercel.buildCommand === null) {
  errors.push('vercel.json must let the Astro build produce the deployment');
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(
  `content ok: ${characters.length} characters, ${works.length} works, ${relations.length} relations, ${sources.length} sources`
);

function dataOf(entries) {
  return (entries ?? []).map((entry) => entry.data);
}

function connects(relation, a, b) {
  if (!a || !b) return false;
  return (relation.from === a && relation.to === b) || (relation.from === b && relation.to === a);
}

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function publicPathExists(urlPath) {
  const rel = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const root = path.join(repoRoot, 'public');
  const candidates = [
    path.join(root, rel),
    path.join(root, rel, 'index.html'),
    path.join(root, `${rel}.html`),
  ];
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function rewriteCovers(urlPath) {
  return vercelRewrites.some((rewrite) => {
    if (rewrite.source === urlPath) return true;
    const prefix = rewrite.source.replace(/\/:path\*$/, '');
    return prefix !== rewrite.source && (urlPath === prefix || urlPath.startsWith(`${prefix}/`));
  });
}

function checkGallery(file) {
  const full = path.join(repoRoot, 'public', 'data', file);
  const parsed = JSON.parse(readFileSync(full, 'utf8'));
  if (!Array.isArray(parsed.images)) {
    errors.push(`data/${file}: images must be an array`);
    return;
  }
  for (const image of parsed.images) {
    if (!image.filename) continue;
    const asset = path.join(repoRoot, 'public', 'assets', 'gallery', image.filename);
    if (!existsSync(asset)) errors.push(`data/${file}: missing assets/gallery/${image.filename}`);
    walkLinks(image, `data/${file}`);
  }
}

function checkJsonLinks(file) {
  const parsed = JSON.parse(readFileSync(path.join(repoRoot, 'public', 'data', file), 'utf8'));
  walkLinks(parsed, `data/${file}`);
}

function walkLinks(value, label) {
  if (Array.isArray(value)) {
    for (const item of value) walkLinks(item, label);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.url === 'string' && value.url.startsWith('/')) {
    if (!publicPathExists(value.url) && !rewriteCovers(value.url)) {
      errors.push(`${label}: broken url ${value.url}`);
    }
  }
  for (const child of Object.values(value)) walkLinks(child, label);
}
