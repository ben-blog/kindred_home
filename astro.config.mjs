import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { astroRedirects } from './routing/legacy.js';

export default defineConfig({
  site: 'https://kinxdred.com',
  output: 'static',
  trailingSlash: 'ignore',
  adapter: vercel({ imageService: false }),
  redirects: astroRedirects,
});
