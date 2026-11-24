import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const gallery = fileURLToPath(new URL('../public/assets/gallery/', import.meta.url));
const filename = /^[a-z0-9][a-z0-9_.-]{0,80}\.webp$/;
const force = process.argv.includes('--force');

// Refuse redirected output directories as well as symlinked inputs/outputs.
if ((await realpath(gallery)) !== gallery.replace(/\/$/, '')) {
  throw new Error('Gallery directory must not contain symlinks');
}
for (const width of [600, 1200]) {
  const output = join(gallery, `w${width}`);
  await mkdir(output, { recursive: true });
  const directory = await lstat(output);
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new Error(`Unsafe thumbnail directory: w${width}`);
  }
}

let written = 0;
let skipped = 0;
for (const entry of await readdir(gallery, { withFileTypes: true })) {
  if (!entry.isFile() || !filename.test(entry.name)) continue;
  const input = join(gallery, entry.name);
  const source = await lstat(input);
  if (source.isSymbolicLink() || !source.isFile()) continue;
  for (const width of [600, 1200]) {
    const output = join(gallery, `w${width}`, entry.name);
    const existing = await lstat(output).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (existing && (existing.isSymbolicLink() || !existing.isFile())) {
      throw new Error(`Unsafe thumbnail output: w${width}/${entry.name}`);
    }
    if (!force && existing && existing.mtimeMs > source.mtimeMs) {
      skipped++;
      continue;
    }
    await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72, effort: 6 })
      .toFile(output);
    written++;
  }
}
console.log(`Gallery thumbnails: ${written} generated, ${skipped} up to date.`);
