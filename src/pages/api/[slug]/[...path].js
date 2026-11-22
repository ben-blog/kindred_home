import { characterRecords } from '../../../lib/character-files.js';
import { handleScopedRequest } from '../../../lib/proxy.js';

export const prerender = false;

function handle({ request }) {
  return handleScopedRequest(request, { characters: characterRecords() });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
