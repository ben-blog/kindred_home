import { z } from 'astro/zod';

/** URL and content key. Lowercase words separated by single hyphens. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const statusSchema = z.enum(['active', 'archived', 'draft']);

/** Two-letter language, optional region or script: `en`, `ko`, `zh-hant`. */
const localeKey = z.string().regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/);

/**
 * A language map. `en` is required. Any other locale key is optional.
 * `ko` is not special: it is just another locale.
 */
export const localizedSchema = z.record(localeKey, z.string().min(1)).superRefine((value, ctx) => {
  if (typeof value.en !== 'string' || value.en.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'en is required',
      path: ['en'],
    });
  }
});

export const siteSchema = z
  .strictObject({
    defaultLocale: localeKey,
    locales: z.array(localeKey).min(1),
  })
  .superRefine((site, ctx) => {
    if (!site.locales.includes('en')) {
      ctx.addIssue({
        code: 'custom',
        message: 'locales must include en',
        path: ['locales'],
      });
    }
    if (!site.locales.includes(site.defaultLocale)) {
      ctx.addIssue({
        code: 'custom',
        message: 'defaultLocale must be one of locales',
        path: ['defaultLocale'],
      });
    }
  });

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Page templates. `sheet` is the default for a character that has not chosen one. */
export const characterLayouts = ['board', 'void', 'sheet'];

/** Interactive marks. A board uses `gaze`. A void uses `room`. A sheet has none. */
export const markTypes = ['gaze', 'room'];

const bezierSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const gazeMarkSchema = z.strictObject({
  type: z.literal('gaze'),
  /** Pupil lag, in milliseconds. The CSS transition is the delay. */
  delay: z.number().positive().default(280),
  easing: bezierSchema.default([0.87, 0, 0.13, 1]),
});

const roomMarkSchema = z.strictObject({
  type: z.literal('room'),
  /** Idle drift, in seconds. */
  drift: z.number().positive().default(22),
  /** Pointer spring, in seconds. */
  follow: z.number().positive().default(1.6),
  easing: bezierSchema.default([0.34, 1.56, 0.64, 1]),
});

/** Env var names the event proxy may use as upstream origins. Values stay in the host env. */
export const agentUpstreamKeys = ['KIN_AGENT_URL', 'DRED_AGENT_URL', 'MIRRORED_API_URL'];

const agentPathSchema = z
  .string()
  .regex(/^\/api\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/);

const relationshipSchema = z
  .strictObject({
    with: slugSchema,
    kinds: z.array(z.string().min(1)).min(1),
    note: localizedSchema.optional(),
    tension: z.number().nonnegative().optional(),
  })
  .superRefine(requireTensionForSseom);

export const characterSchema = z
  .strictObject({
    slug: slugSchema,
    status: statusSchema,
    name: localizedSchema,
    aliases: z.array(z.string().regex(/^\/[A-Za-z0-9/_-]*$/)).default([]),
    layout: z.enum(characterLayouts).default('sheet'),
    profile: z.strictObject({
      tagline: localizedSchema,
      bio: localizedSchema,
      traits: z.array(z.string().min(1)).default([]),
    }),
    identity: z.strictObject({
      color: hexColor,
      /** Near-black page ground. Omitted means the layout default. */
      ground: hexColor.optional(),
      mark: z.discriminatedUnion('type', [gazeMarkSchema, roomMarkSchema]).optional(),
      model: z.string().min(1).optional(),
    }),
    voice: z.strictObject({
      tone: z.string(),
      do: z.array(z.string().min(1)).default([]),
      dont: z.array(z.string().min(1)).default([]),
      sampleLines: z.array(z.string().min(1)).default([]),
      /** Quiet line in an empty call. Omitted means the transcript starts blank. */
      idle: localizedSchema.optional(),
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
        service: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
        upstream: z.enum(agentUpstreamKeys),
        path: agentPathSchema,
        /** Chat route on that agent. Omitted means this character has no call. */
        chat: agentPathSchema.optional(),
        /** Memory map on that agent. Omitted means the call has no sphere. */
        memory: agentPathSchema.optional(),
        /** Album-moment write on that agent. Omitted means publish cannot store a memory. */
        album: agentPathSchema.optional(),
        /** User id the agent expects. The browser cannot choose a different one. */
        chatUser: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,50}$/)
          .optional(),
        methods: z
          .array(z.enum(['POST']))
          .min(1)
          .max(1)
          .default(['POST']),
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
  })
  .superRefine((character, ctx) => {
    if (character.agent) {
      const prefix = `/api/${character.slug}/`;
      if (!character.agent.path.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          message: `agent path must start with ${prefix}`,
          path: ['agent', 'path'],
        });
      }
      if (character.agent.chat && !character.agent.chat.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          message: `agent chat path must start with ${prefix}`,
          path: ['agent', 'chat'],
        });
      }
      if (character.agent.memory && !character.agent.memory.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          message: `agent memory path must start with ${prefix}`,
          path: ['agent', 'memory'],
        });
      }
      if (character.agent.album && !character.agent.album.startsWith(prefix)) {
        ctx.addIssue({
          code: 'custom',
          message: `agent album path must start with ${prefix}`,
          path: ['agent', 'album'],
        });
      }
    }
    const mark = character.identity.mark?.type;
    if (character.layout === 'board' && mark !== 'gaze') {
      ctx.addIssue({
        code: 'custom',
        message: 'a board layout needs a gaze mark',
        path: ['identity', 'mark'],
      });
    }
    if (character.layout === 'void' && mark !== 'room') {
      ctx.addIssue({
        code: 'custom',
        message: 'a void layout needs a room mark',
        path: ['identity', 'mark'],
      });
    }
    if (character.layout === 'sheet' && mark) {
      ctx.addIssue({
        code: 'custom',
        message: 'a sheet layout has no mark',
        path: ['identity', 'mark'],
      });
    }
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

/** Providers the daily ingest knows. The source file picks one. Code does not. */
export const sourceProviders = ['anilist', 'musicbrainz', 'open-meteo'];

const sourceMediaSchema = z.strictObject({
  type: z.enum(['ANIME', 'MANGA']),
  kind: z.string().min(1),
});

const providerFields = [
  'provider',
  'media',
  'releaseKind',
  'query',
  'latitude',
  'longitude',
  'timezone',
  'weatherKind',
  'seasonKind',
];

export const sourceSchema = z
  .strictObject({
    id: slugSchema,
    scope: z.enum(['character', 'shared']),
    character: slugSchema.optional(),
    category: z.string().min(1),
    kinds: z.array(z.string().min(1)).min(1),
    /**
     * `false` keeps the source as catalog only.
     * `true` requires `provider` and the fields that provider reads.
     */
    fetch: z.boolean(),
    provider: z.enum(sourceProviders).optional(),
    media: z.array(sourceMediaSchema).min(1).max(4).optional(),
    releaseKind: z.string().min(1).optional(),
    query: z
      .string()
      .regex(/^[A-Za-z0-9:()._\- ]{1,180}$/)
      .optional(),
    latitude: z.number().gte(-90).lte(90).optional(),
    longitude: z.number().gte(-180).lte(180).optional(),
    timezone: z
      .string()
      .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/)
      .optional(),
    weatherKind: z.string().min(1).optional(),
    seasonKind: z.string().min(1).optional(),
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
    if (source.fetch === false) {
      for (const key of providerFields) {
        if (source[key] != null) {
          ctx.addIssue({
            code: 'custom',
            message: 'a source that is not fetched has no provider fields',
            path: [key],
          });
        }
      }
      return;
    }
    if (!source.provider) {
      ctx.addIssue({
        code: 'custom',
        message: 'fetched sources require a provider',
        path: ['provider'],
      });
      return;
    }
    const allowed = providerFieldsFor(source.provider);
    for (const key of providerFields) {
      if (key === 'provider') continue;
      if (source[key] != null && !allowed.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `${source.provider} does not use ${key}`,
          path: [key],
        });
      }
    }
    if (source.provider === 'anilist') {
      if (!source.media?.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'anilist sources list media',
          path: ['media'],
        });
      }
      for (const [index, item] of (source.media ?? []).entries()) {
        if (!source.kinds.includes(item.kind)) {
          ctx.addIssue({
            code: 'custom',
            message: 'media kind must be one of kinds',
            path: ['media', index, 'kind'],
          });
        }
      }
    }
    if (source.provider === 'musicbrainz') {
      if (!source.releaseKind || !source.kinds.includes(source.releaseKind)) {
        ctx.addIssue({
          code: 'custom',
          message: 'releaseKind must be one of kinds',
          path: ['releaseKind'],
        });
      }
      if (source.releaseKind === 'lyrics') {
        ctx.addIssue({
          code: 'custom',
          message: 'a music source does not fetch lyric bodies',
          path: ['releaseKind'],
        });
      }
    }
    if (source.provider === 'open-meteo') {
      for (const key of ['latitude', 'longitude', 'timezone', 'weatherKind', 'seasonKind']) {
        if (source[key] == null) {
          ctx.addIssue({
            code: 'custom',
            message: `open-meteo sources require ${key}`,
            path: [key],
          });
        }
      }
      if (source.weatherKind && !source.kinds.includes(source.weatherKind)) {
        ctx.addIssue({
          code: 'custom',
          message: 'weatherKind must be one of kinds',
          path: ['weatherKind'],
        });
      }
      if (source.seasonKind && !source.kinds.includes(source.seasonKind)) {
        ctx.addIssue({
          code: 'custom',
          message: 'seasonKind must be one of kinds',
          path: ['seasonKind'],
        });
      }
      if (source.weatherKind && source.weatherKind === source.seasonKind) {
        ctx.addIssue({
          code: 'custom',
          message: 'weatherKind and seasonKind differ',
          path: ['seasonKind'],
        });
      }
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
    /** `false` keeps the work and its page, and leaves it off character pages and `/works`. */
    listed: z.boolean().default(true),
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

/** Expression labels the call stage understands. Gallery tags and the chat proxy share this list. */
export const expressionEmotions = ['joy', 'playful', 'calm', 'shy', 'sad', 'intense', 'tired'];

const expressionSrc = z
  .string()
  .regex(/^\/[A-Za-z0-9/_.-]+$/)
  .refine((value) => !value.includes('..') && !value.includes('//'), 'src must stay on this site');

export const expressionSchema = z.strictObject({
  slug: slugSchema,
  frames: z.array(
    z.strictObject({
      id: z.string().min(1).max(80),
      emotions: z.array(z.enum(expressionEmotions)).min(1),
      portrait: z.boolean(),
      /** Optional still. When set, it wins over the gallery file with the same id. */
      src: expressionSrc.optional(),
    })
  ),
});

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

function providerFieldsFor(provider) {
  if (provider === 'anilist') return new Set(['media']);
  if (provider === 'musicbrainz') return new Set(['releaseKind', 'query']);
  if (provider === 'open-meteo') {
    return new Set(['latitude', 'longitude', 'timezone', 'weatherKind', 'seasonKind']);
  }
  return new Set();
}

function requireTensionForSseom(value, ctx) {
  if (value.kinds.includes('썸') && typeof value.tension !== 'number') {
    ctx.addIssue({
      code: 'custom',
      message: 'a 썸 relation requires a numeric tension value',
      path: ['tension'],
    });
  }
}
