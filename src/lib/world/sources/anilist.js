import {
  FETCH_TIMEOUT_MS,
  RELEASE_WINDOW_DAYS,
  USER_AGENT,
  baseEvent,
  cleanPayload,
  daysAgo,
  fuzzyDate,
  readUpstream,
} from './common.js';

const QUERY = `query ($start: FuzzyDateInt) {
  anime: Page(page: 1, perPage: 8) {
    media(type: ANIME, sort: START_DATE_DESC, startDate_greater: $start, status_in: [NOT_YET_RELEASED, RELEASING]) {
      id
      title { romaji english }
      format
      startDate { year month day }
    }
  }
  manga: Page(page: 1, perPage: 8) {
    media(type: MANGA, sort: START_DATE_DESC, startDate_greater: $start, status_in: [NOT_YET_RELEASED, RELEASING]) {
      id
      title { romaji english }
      format
      startDate { year month day }
    }
  }
}`;

export function anilistRequest(now) {
  return {
    url: 'https://graphql.anilist.co',
    init: {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { start: fuzzyDate(daysAgo(now, RELEASE_WINDOW_DAYS)) },
      }),
    },
  };
}

export async function fetchAnilist(source, fetchImpl, now) {
  const request = anilistRequest(now);
  const response = await fetchImpl(request.url, {
    ...request.init,
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return parseAnilist(await readUpstream(response), source);
}

export function parseAnilist(body, source) {
  const events = [];
  for (const binding of source.media ?? []) {
    const group = binding.type === 'MANGA' ? body?.data?.manga : body?.data?.anime;
    const list = Array.isArray(group?.media) ? group.media : [];
    for (const item of list.slice(0, 8)) {
      const event = mediaEvent(item, source, binding);
      if (event) events.push(event);
    }
  }
  return events;
}

function mediaEvent(item, source, binding) {
  const id = Number(item?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const title = pickTitle(item?.title);
  if (!title) return null;
  const path = binding.type === 'MANGA' ? 'manga' : 'anime';
  const payload = cleanPayload({
    category: source.category,
    kind: binding.kind,
    title,
    format: typeof item.format === 'string' ? item.format : '',
    siteUrl: `https://anilist.co/${path}/${id}`,
    date: dateOf(item.startDate),
  });
  if (payload.kind !== binding.kind) return null;
  return baseEvent(source, binding.kind, String(id), payload);
}

function pickTitle(title) {
  if (!title || typeof title !== 'object') return '';
  if (typeof title.english === 'string' && title.english.trim()) return title.english;
  if (typeof title.romaji === 'string' && title.romaji.trim()) return title.romaji;
  return '';
}

function dateOf(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!year || !month || !day) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}
