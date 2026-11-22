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
})();
