import { eventSchema } from '../../../world/schema.js';
import { fetchSource } from './sources/fetch.js';

export async function ingestWorld({ canon, store, fetch: fetchImpl, now = new Date() }) {
  const sources = (canon.sources ?? []).filter(
    (source) => source.fetch === true && source.provider
  );
  const settled = await Promise.all(
    sources.map(async (source) => {
      let appended = 0;
      let ok = true;
      try {
        const partials = await fetchSource(source, fetchImpl, now);
        const at = now.toISOString();
        for (const partial of partials) {
          const event = complete(partial, canon.world.id, at);
          if (!event) continue;
          const saved = await store.append(event);
          if (!saved?.ok) throw new Error('store');
          if (!saved.duplicate) appended += 1;
        }
      } catch {
        ok = false;
      }
      try {
        await store.recordRun({
          worldId: canon.world.id,
          sourceId: source.id,
          ok,
          appended,
          detail: ok ? {} : { error: 'fetch_failed' },
        });
      } catch {
        ok = false;
      }
      return { id: source.id, ok, appended };
    })
  );
  settled.sort((a, b) => a.id.localeCompare(b.id));
  return settled;
}

function complete(partial, worldId, at) {
  if (!partial || typeof partial !== 'object') return null;
  const event = {
    id: partial.id,
    worldId,
    tick: null,
    at,
    who: partial.who,
    what: 'external',
    where: null,
    payload: partial.payload ?? {},
    source: 'external',
  };
  if (partial.target) event.target = partial.target;
  const parsed = eventSchema.safeParse(event);
  return parsed.success ? parsed.data : null;
}
