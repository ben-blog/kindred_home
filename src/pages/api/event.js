import { characterRecords } from '../../lib/character-files.js';
import { handleEventRequest } from '../../lib/proxy.js';

export const prerender = false;

function handle({ request }) {
  return handleEventRequest(request, { characters: characterRecords() });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
