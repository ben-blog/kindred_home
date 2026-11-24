import { bundledCanon } from '../../../../lib/canon-files.js';
import { handleAlbumPick } from '../../../../lib/world/album-observe.js';
import { staticGallery } from '../../../../lib/world/gallery-static.js';

export const prerender = false;

function handle(context) {
  return handleAlbumPick(context.request, {
    canon: bundledCanon(),
    slug: context.params.character,
    staticGallery,
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
