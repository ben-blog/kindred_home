/** Live Vercel routes. Keep these working with the same destinations. */
export const vercelRedirects = [
  { source: '/kin/k2', destination: '/main.html', permanent: true },
  { source: '/kin/k2/:path*', destination: '/main.html', permanent: true },
  { source: '/kin/k2/:path*/', destination: '/main.html', permanent: true },
  { source: '/dred/d2', destination: '/main.html', permanent: true },
  { source: '/dred/d2/:path*', destination: '/main.html', permanent: true },
  { source: '/dred/d2/:path*/', destination: '/main.html', permanent: true },
];

export const vercelRewrites = [
  { source: '/mood-camera', destination: 'https://mirrored-five.vercel.app/mood-camera' },
  {
    source: '/mood-camera/:path*',
    destination: 'https://mirrored-five.vercel.app/mood-camera/:path*',
  },
  { source: '/_next/:path*', destination: 'https://mirrored-five.vercel.app/_next/:path*' },
  { source: '/assets/gallery/:file', destination: '/api/gallery/file?name=:file' },
];

/**
 * Exact paths Astro can emit. Nested K2/D2 paths are injected into the Vercel
 * route table by scripts/apply-legacy-routes.js, because Astro refuses a
 * dynamic redirect onto a static public file.
 */
export const astroRedirects = {
  '/kin/k2': { status: 308, destination: '/main.html' },
  '/dred/d2': { status: 308, destination: '/main.html' },
};
