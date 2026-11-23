import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { astroRedirects } from './routing/legacy.js';

const site = 'https://www.kinxdred.com';
const publicFiles = ['/', '/main.html', '/kin', '/dred', '/dred/d14'];

function isPublicPage(page) {
  const path = new URL(page).pathname;
  if (path === '/login' || path.startsWith('/login/')) return false;
  if (path === '/world' || path.startsWith('/world/')) return false;
  if (path === '/api' || path.startsWith('/api/')) return false;
  if (path === '/auth' || path.startsWith('/auth/')) return false;
  return true;
}

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // Chat streams a model reply. 60s is the hobby function cap. Other routes still abort on their own timers.
  // Classic middleware runs inside the Node function, which has the WORLD_* env.
  // Edge middleware only inlines literal process.env.NAME reads, so the gate saw an empty env and returned 503.
  adapter: vercel({ imageService: false, maxDuration: 60, middlewareMode: 'classic' }),
  integrations: [
    sitemap({
      filter: isPublicPage,
      customPages: publicFiles.map((path) => new URL(path, site).href),
    }),
  ],
  redirects: astroRedirects,
});
