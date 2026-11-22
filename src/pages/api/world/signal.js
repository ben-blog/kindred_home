import { bundledCanon } from '../../../lib/canon-files.js';
import { handleWorldSignal } from '../../../lib/world/handlers.js';

export const prerender = false;

function handle(context) {
  return handleWorldSignal(context.request, { canon: bundledCanon() });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
