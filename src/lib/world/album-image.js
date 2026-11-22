const TARGET_BYTES = 4_000_000;

export async function toWebp(bytes) {
  const sharp = (await import('sharp')).default;
  let quality = 82;
  let width = 1600;
  let output = await render(sharp, bytes, width, quality);
  while (output.byteLength > TARGET_BYTES && quality > 40) {
    quality -= 10;
    width = Math.round(width * 0.85);
    output = await render(sharp, bytes, width, quality);
  }
  if (output.byteLength > TARGET_BYTES) {
    const error = new Error('image');
    error.code = 'image';
    throw error;
  }
  return output;
}

function render(sharp, bytes, width, quality) {
  return sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
