/* Shared browser helpers. Paths are site-root paths; Vercel serves this
   repo from `/` (kindred-home.vercel.app). */
(function () {
  window.asset = function (path) {
    return path;
  };

  /* Character-agent events are best-effort. The servers only echo
     Access-Control-Allow-Origin for kinxdred.com, so other hosts skip the
     call instead of logging a blocked preflight. */
  window.reportEvent = function (url, body) {
    var h = location.hostname;
    if (h !== 'kinxdred.com' && h !== 'www.kinxdred.com') return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {});
  };
})();
