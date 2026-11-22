import kinGallery from '../../../public/data/kindred_gallery_kin.json';
import dredGallery from '../../../public/data/kindred_gallery_dred.json';
import { filenamesOf } from './gallery-feed.js';

const docs = [kinGallery, dredGallery];

export function staticGallery(slug) {
  return docs.find((doc) => String(doc?.character || '').toLowerCase() === slug) || null;
}

export function reservedFilenames() {
  const names = new Set();
  for (const doc of docs) {
    for (const name of filenamesOf(doc)) names.add(name);
  }
  return names;
}
