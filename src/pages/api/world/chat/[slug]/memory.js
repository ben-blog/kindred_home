import { bundledCanon } from '../../../../../lib/canon-files.js';
import { handleWorldMemory } from '../../../../../lib/world/memory.js';

export const prerender = false;

function handle(context) {
  return handleWorldMemory(context.request, {
    canon: bundledCanon(),
    slug: context.params.slug,
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
