import { handleGalleryFile } from '../../../lib/world/gallery-public.js';

export const prerender = false;

function handle(context) {
  const name = new URL(context.request.url).searchParams.get('name') || '';
  return handleGalleryFile(context.request, { filename: name });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
