import { bundledCanon } from '../../../../lib/canon-files.js';
import { handleWorldMagic } from '../../../../lib/world/handlers.js';

export const prerender = false;

function handle(context) {
  return handleWorldMagic(context.request, { canon: bundledCanon() });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
