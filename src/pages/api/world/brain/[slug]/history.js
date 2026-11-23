import { bundledCanon } from '../../../../../lib/canon-files.js';
import { handleWorldHistory } from '../../../../../lib/world/history.js';

export const prerender = false;

function handle(context) {
  return handleWorldHistory(context.request, {
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
