import { bundledCanon } from '../../../../../lib/canon-files.js';
import { handleWorldChat } from '../../../../../lib/world/chat.js';

export const prerender = false;

function handle(context) {
  return handleWorldChat(context.request, {
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
