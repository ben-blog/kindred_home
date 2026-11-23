/* Shared browser helpers. Paths are site-root paths; Vercel serves this
   repo from `/` (kindred-home.vercel.app). */
(function () {
  /* Supabase sends a disallowed magic link to the site root, often with the
     session in the hash. The static homepage is served before middleware,
     so this is what carries those params to the callback. */
  var path = location.pathname;
  if (path === '/' || path === '/index.html') {
    var query = new URLSearchParams(location.search);
    var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    var auth =
      query.has('code') ||
      query.has('token_hash') ||
      query.has('error') ||
      hash.has('access_token') ||
      hash.has('error') ||
      hash.has('error_code');
    if (auth) {
      var target = new URL('/auth/callback', location.origin);
      query.forEach(function (value, key) {
        if (key !== 'next') target.searchParams.append(key, value);
      });
      target.searchParams.set('next', query.get('next') || '/world/admin');
      target.hash = location.hash;
      location.replace(target.toString());
      return;
    }
  }

  window.asset = function (path) {
    return path;
  };

  /* Character-agent events are best-effort and same-origin. Only the public
     site sends them, so preview and local hosts do not write to the agents.
     A 503 or a network failure must not stop the page. */
  window.reportEvent = function (slug, body) {
    var h = location.hostname;
    if (h !== 'kinxdred.com' && h !== 'www.kinxdred.com') return;
    if (!slug) return;
    try {
      fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, event: body }),
      }).catch(function () {});
    } catch {
      /* A broken payload must not break the page. */
    }
  };

  if (location.pathname === '/world' || location.pathname.indexOf('/world/') === 0) return;
  if (document.querySelector('a.ben-hub')) return;
  fetch('/api/world/auth/session', { headers: { accept: 'application/json' } })
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (body) {
      if (!body || body.signedIn !== true || document.querySelector('a.ben-hub')) return;
      var link = document.createElement('a');
      link.className = 'ben-hub';
      link.href = '/world/admin';
      link.textContent = 'Ben hub';
      link.style.cssText = [
        'position:fixed',
        'z-index:40',
        'right:max(12px, env(safe-area-inset-right))',
        'bottom:max(12px, env(safe-area-inset-bottom))',
        'padding:8px 10px',
        'background:rgba(8,8,8,.88)',
        'border:1px solid rgba(255,255,255,.22)',
        'color:rgba(255,255,255,.5)',
        'font:11px/1 "DM Mono", ui-monospace, monospace',
        'letter-spacing:.14em',
        'text-transform:uppercase',
        'text-decoration:none',
      ].join(';');
      document.body.appendChild(link);
    })
    .catch(function () {});
})();
