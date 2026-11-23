import { guardRequest } from './lib/access/guard.js';

export function onRequest(context, next) {
  // Prerender has no visitor. Skipping here keeps the static HTML intact.
  // On demand, this runs in the Node function, where process.env has the world secrets.
  if (context.isPrerendered) return next();
  return guardRequest(context.request, { next, env: process.env });
}
