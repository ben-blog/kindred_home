import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { astroRedirects } from './routing/legacy.js';

export default defineConfig({
  site: 'https://kinxdred.com',
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // Chat streams a model reply. 60s is the hobby function cap. Other routes still abort on their own timers.
  adapter: vercel({ imageService: false, maxDuration: 60 }),
  redirects: astroRedirects,
});
