import { bundledCanon } from '../../../../lib/canon-files.js';
import { reservedFilenames } from '../../../../lib/world/gallery-static.js';
import { handleAlbum } from '../../../../lib/world/album.js';

export const prerender = false;
export const maxDuration = 60;

const reserved = reservedFilenames();

function handle(context) {
  return handleAlbum(context.request, { canon: bundledCanon(), reservedFilenames: reserved });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
