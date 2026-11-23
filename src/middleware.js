import { guardRequest } from './lib/access/guard.js';

export function onRequest(context, next) {
  // Prerender has no visitor. Skipping here keeps the static HTML intact;
  // the edge middleware runs again on the request with isPrerendered false.
  if (context.isPrerendered) return next();
  return guardRequest(context.request, { next, env: process.env });
}
