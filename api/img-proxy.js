// AniList CDN 이미지 프록시 — CORS 우회용
// 허용 도메인: s4.anilist.co만 허용 (보안)
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  // AniList CDN만 허용
  if (!url.startsWith('https://s4.anilist.co/')) {
    return res.status(403).json({ error: 'only anilist cdn allowed' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'upstream error' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'fetch failed' });
  }
}
