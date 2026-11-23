import { bundledCanon } from '../../../../lib/canon-files.js';
import { staticGallery } from '../../../../lib/world/gallery-static.js';
import { handleGalleryFeed } from '../../../../lib/world/gallery-public.js';

export const prerender = false;

function handle(context) {
  const slug = context.params.character;
  return handleGalleryFeed(context.request, {
    canon: bundledCanon(),
    slug,
    staticDoc: staticGallery(slug),
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
