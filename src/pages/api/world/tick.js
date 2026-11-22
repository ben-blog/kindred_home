import { bundledCanon } from '../../../lib/canon-files.js';
import { handleWorldTick } from '../../../lib/world/handlers.js';

export const prerender = false;

function handle(context) {
  return handleWorldTick(context.request, { canon: bundledCanon() });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
