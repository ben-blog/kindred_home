/** Walk a Vercel Build Output route list the way the edge router does. */
export function resolveRoute(routes, pathname, fileExists) {
  let sawFilesystem = false;
  for (const route of routes) {
    if (route.handle === 'filesystem') {
      sawFilesystem = true;
      if (fileExists(pathname)) return { type: 'file' };
      continue;
    }
    if (route.handle || !route.src) continue;
    const match = pathname.match(new RegExp(route.src));
    if (!match) continue;
    if (route.status && route.headers?.Location) {
      return { type: 'redirect', status: route.status, location: route.headers.Location };
    }
    if (typeof route.dest === 'string' && /^https?:\/\//.test(route.dest)) {
      if (!sawFilesystem && fileExists(pathname)) return { type: 'file' };
      return { type: 'rewrite', dest: substitute(route.dest, match) };
    }
    if (typeof route.dest === 'string') {
      return { type: 'function', dest: route.dest };
    }
  }
  if (fileExists(pathname)) return { type: 'file' };
  return { type: 'miss' };
}

export function substitute(dest, match) {
  return dest.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
}
