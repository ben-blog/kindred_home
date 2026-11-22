import { bundledCanon } from '../../../lib/canon-files.js';
import { handleWorldGet } from '../../../lib/world/handlers.js';

export const prerender = false;

function handle(context) {
  return handleWorldGet(context.request, { canon: bundledCanon() });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
