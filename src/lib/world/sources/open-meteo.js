import { FETCH_TIMEOUT_MS, USER_AGENT, baseEvent, cleanPayload, readUpstream } from './common.js';

const NORTHERN = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter',
];

const FLIP = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };

export function seasonName(month, latitude) {
  const name = NORTHERN[month - 1];
  if (!name) return null;
  return latitude < 0 ? FLIP[name] : name;
}

export function openMeteoUrl(source) {
  const params = new URLSearchParams({
    latitude: String(source.latitude),
    longitude: String(source.longitude),
    current: 'temperature_2m,weather_code',
    timezone: source.timezone,
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export async function fetchOpenMeteo(source, fetchImpl) {
  const response = await fetchImpl(openMeteoUrl(source), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return parseOpenMeteo(await readUpstream(response), source);
}

export function parseOpenMeteo(body, source) {
  const current = body?.current;
  const date = typeof current?.time === 'string' ? current.time.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const month = Number(date.slice(5, 7));
  const temperature = Number(current.temperature_2m);
  const code = Number(current.weather_code);
  const events = [];
  if (Number.isFinite(temperature) && Number.isInteger(code)) {
    events.push(
      baseEvent(
        source,
        source.weatherKind,
        date,
        cleanPayload({
          category: source.category,
          kind: source.weatherKind,
          temperatureC: Math.round(temperature * 10) / 10,
          weatherCode: code,
          date,
        })
      )
    );
  }
  const season = seasonName(month, source.latitude);
  if (season) {
    events.push(
      baseEvent(
        source,
        source.seasonKind,
        `${date.slice(0, 4)}-${season}`,
        cleanPayload({
          category: source.category,
          kind: source.seasonKind,
          season,
          date,
        })
      )
    );
  }
  return events;
}
