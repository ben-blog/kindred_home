import { existsSync } from 'node:fs';

const DEFAULT_IMAGE = '/og/og-home.jpg';

export function ogImageFor(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return DEFAULT_IMAGE;
  }
  const image = `/og/og-${slug}.jpg`;
  return existsSync(new URL(`../../public${image}`, import.meta.url)) ? image : DEFAULT_IMAGE;
}
