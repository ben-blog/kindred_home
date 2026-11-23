/* Shared browser helpers. Paths are site-root paths; Vercel serves this
   repo from `/` (kindred-home.vercel.app). */
(function () {
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
