import { bundledCanon } from '../../../lib/canon-files.js';
import { handleWorldIngest } from '../../../lib/world/handlers.js';

export const prerender = false;
export const maxDuration = 60;

function handle(context) {
  return handleWorldIngest(context.request, { canon: bundledCanon() });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
