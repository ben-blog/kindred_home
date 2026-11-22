import {
  FETCH_TIMEOUT_MS,
  RELEASE_WINDOW_DAYS,
  USER_AGENT,
  baseEvent,
  cleanPayload,
  daysAgo,
  readUpstream,
  ymd,
} from './common.js';

export function musicBrainzUrl(source, now) {
  const from = ymd(daysAgo(now, RELEASE_WINDOW_DAYS));
  const to = ymd(now);
  const query = source.query?.trim() || 'status:official';
  const params = new URLSearchParams({
    fmt: 'json',
    limit: '8',
    query: `(${query}) AND date:[${from} TO ${to}]`,
  });
  return `https://musicbrainz.org/ws/2/release/?${params}`;
}

export async function fetchMusicBrainz(source, fetchImpl, now) {
  const response = await fetchImpl(musicBrainzUrl(source, now), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return parseMusicBrainz(await readUpstream(response), source);
}

export function parseMusicBrainz(body, source) {
  const releases = Array.isArray(body?.releases) ? body.releases : [];
  const events = [];
  for (const release of releases.slice(0, 8)) {
    const id = typeof release?.id === 'string' ? release.id.trim() : '';
    const title = typeof release?.title === 'string' ? release.title.trim() : '';
    if (!id || !title || id.length > 80) continue;
    const payload = cleanPayload({
      category: source.category,
      kind: source.releaseKind,
      title,
      artist: artistOf(release),
      releaseId: id,
      date: typeof release?.date === 'string' ? release.date : '',
    });
    if (payload.kind !== source.releaseKind) continue;
    events.push(baseEvent(source, source.releaseKind, id, payload));
  }
  return events;
}

function artistOf(release) {
  const credit = Array.isArray(release?.['artist-credit']) ? release['artist-credit'] : [];
  return credit
    .map((part) => (typeof part?.name === 'string' ? part.name.trim() : ''))
    .filter(Boolean)
    .join(', ');
}
