/* Site root for GitHub Pages project sites (ben-blog.github.io/kindred_home)
   and for hosts served from `/` (Vercel, local). Load this classic script
   before any module that calls asset(). */
(function () {
  var host = location.hostname || '';
  var base = '';
  if (host.endsWith('.github.io')) {
    var first = location.pathname.split('/').filter(Boolean)[0];
    if (first === 'kindred_home') base = '/kindred_home';
  }
  window.SITE_BASE = base;

  window.asset = function (path) {
    if (!path || path.charAt(0) !== '/' || path.charAt(1) === '/') return path;
    return base + path;
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
