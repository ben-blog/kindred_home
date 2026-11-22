import { z } from 'astro/zod';

/** URL and content key. Lowercase words separated by single hyphens. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const statusSchema = z.enum(['active', 'archived', 'draft']);

export const localizedSchema = z.strictObject({
  ko: z.string().min(1),
  en: z.string().min(1),
});

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const relationshipSchema = z
  .strictObject({
    with: slugSchema,
    kinds: z.array(z.string().min(1)).min(1),
    note: z.string().min(1).optional(),
    tension: z.number().nonnegative().optional(),
  })
  .superRefine(requireTensionForSseom);

export const characterSchema = z.strictObject({
  slug: slugSchema,
  status: statusSchema,
  name: localizedSchema,
  aliases: z.array(z.string().regex(/^\/[A-Za-z0-9/_-]*$/)).default([]),
  profile: z.strictObject({
    tagline: localizedSchema,
    bio: localizedSchema,
    traits: z.array(z.string().min(1)).default([]),
  }),
  identity: z.strictObject({
    color: hexColor,
    mark: z.strictObject({
      points: z.number().int().positive(),
      wobble: z.number().nonnegative(),
      speed: z.number().positive(),
      scatterOnHover: z.boolean(),
    }),
    model: z.string().min(1).optional(),
  }),
  voice: z.strictObject({
    tone: z.string(),
    do: z.array(z.string().min(1)).default([]),
    dont: z.array(z.string().min(1)).default([]),
    sampleLines: z.array(z.string().min(1)).default([]),
  }),
  lore: z
    .array(
      z.strictObject({
        id: slugSchema,
        title: localizedSchema,
        body: localizedSchema,
        unlock: z.strictObject({ stage: z.number().int().positive() }).optional(),
      })
    )
    .default([]),
  relationships: z.array(relationshipSchema).default([]),
  agent: z
    .strictObject({
      service: z.string().min(1),
      eventPath: z.url(),
    })
    .optional(),
  works: z.array(slugSchema).default([]),
  location: slugSchema,
  initial: z.strictObject({
    mood: z.number().int().nonnegative(),
    energy: z.number().int().nonnegative(),
    xp: z.number().int().nonnegative(),
    level: z.number().int().positive(),
  }),
});

export const worldRulesSchema = z.strictObject({
  moodThreshold: z.number().int().positive(),
  moodMax: z.number().int().positive(),
  energyMax: z.number().int().positive(),
  energyIdleDecay: z.number().int().nonnegative(),
  xpPerLevel: z.number().int().positive(),
  relationMax: z.number().int().positive(),
  tensionMax: z.number().int().positive(),
  maxInfluencePerEvent: z.number().int().positive(),
});

export const worldSchema = z.strictObject({
  id: slugSchema,
  name: z.string().min(1),
  tick: z.number().int().nonnegative(),
  rules: worldRulesSchema,
});

export const locationSchema = z.strictObject({
  slug: slugSchema,
  name: localizedSchema,
  path: z.string().regex(/^\//).optional(),
  note: z.string().min(1),
});

export const entitySchema = z
  .strictObject({
    slug: slugSchema,
    kind: z.enum(['character', 'work', 'object', 'leader']),
    name: z.string().min(1),
    status: statusSchema,
    role: localizedSchema.optional(),
  })
  .superRefine((entity, ctx) => {
    if (entity.kind === 'leader' && !entity.role) {
      ctx.addIssue({
        code: 'custom',
        message: 'leader entities require role',
        path: ['role'],
      });
    }
  });

export const relationSchema = z
  .strictObject({
    id: slugSchema,
    from: slugSchema,
    to: slugSchema,
    kinds: z.array(z.string().min(1)).min(1),
    strength: z.number().int().nonnegative(),
    tension: z.number().nonnegative().optional(),
    note: z.string().min(1).optional(),
  })
  .superRefine(requireTensionForSseom);

export const sourceSchema = z
  .strictObject({
    id: slugSchema,
    scope: z.enum(['character', 'shared']),
    character: slugSchema.optional(),
    category: z.string().min(1),
    kinds: z.array(z.string().min(1)).min(1),
    /** v0 stores the category only. Fetching is a later phase. */
    fetch: z.literal(false),
  })
  .superRefine((source, ctx) => {
    if (source.scope === 'character' && !source.character) {
      ctx.addIssue({
        code: 'custom',
        message: 'character sources require character',
        path: ['character'],
      });
    }
    if (source.scope === 'shared' && source.character) {
      ctx.addIssue({
        code: 'custom',
        message: 'shared sources do not name a character',
        path: ['character'],
      });
    }
  });

export const workSchema = z
  .strictObject({
    slug: slugSchema,
    status: statusSchema,
    title: localizedSchema,
    summary: localizedSchema,
    kind: z.enum(['gallery', 'experience', 'external']),
    url: z.string().regex(/^\//),
    external: z.boolean(),
    scope: z.enum(['character', 'shared']),
    characters: z.array(slugSchema).default([]),
  })
  .superRefine((work, ctx) => {
    if (work.scope === 'character' && work.characters.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'character-scoped works list at least one character',
        path: ['characters'],
      });
    }
  });

export const campaignSchema = z.strictObject({
  slug: slugSchema,
  status: statusSchema,
  title: localizedSchema,
  summary: localizedSchema,
  characters: z.array(slugSchema).default([]),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  utmCampaign: z.string().min(1),
  cta: z.strictObject({
    label: localizedSchema,
    href: z.string().min(1),
  }),
});

const isoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);

export const eventTypes = ['influence', 'agent_action', 'external', 'tick'];

export const eventSchema = z.strictObject({
  id: z.string().min(1),
  worldId: slugSchema,
  tick: z.number().int().nonnegative().nullable(),
  at: isoTimestamp,
  who: z.string().min(1),
  what: z.enum(eventTypes),
  where: z.string().min(1).nullable().optional(),
  target: slugSchema.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  source: z.string().min(1),
});

export const collections = {
  characters: { dir: 'characters', schema: characterSchema, idKey: 'slug' },
  world: { dir: 'world', schema: worldSchema, idKey: 'id' },
  locations: { dir: 'locations', schema: locationSchema, idKey: 'slug' },
  entities: { dir: 'entities', schema: entitySchema, idKey: 'slug' },
  relations: { dir: 'relations', schema: relationSchema, idKey: 'id' },
  sources: { dir: 'sources', schema: sourceSchema, idKey: 'id' },
  works: { dir: 'works', schema: workSchema, idKey: 'slug' },
  campaigns: { dir: 'campaigns', schema: campaignSchema, idKey: 'slug' },
};

function requireTensionForSseom(value, ctx) {
  if (value.kinds.includes('썸') && typeof value.tension !== 'number') {
    ctx.addIssue({
      code: 'custom',
      message: 'a 썸 relation requires a numeric tension value',
      path: ['tension'],
    });
  }
}
