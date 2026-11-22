import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { parseAnilist } from './sources/anilist.js';
import { USER_AGENT } from './sources/common.js';
import { musicBrainzUrl, parseMusicBrainz } from './sources/musicbrainz.js';
import { openMeteoUrl, parseOpenMeteo, seasonName } from './sources/open-meteo.js';

const canon = loadCanon();
const lyric = 'verse one that must never be stored in the world';
const synopsis = 'A long synopsis that must not be stored.';

function fixture(name) {
  return JSON.parse(
    readFileSync(new URL(`./sources/fixtures/${name}.json`, import.meta.url), 'utf8')
  );
}

function source(id) {
  return canon.sources.find((item) => item.id === id);
}

test('anilist rows become release events without synopsis or foreign urls', () => {
  const events = parseAnilist(fixture('anilist'), source('kin-subculture'));
  assert.equal(events.length, 2);
  assert.equal(events[0].target, 'kin');
  assert.equal(events[0].payload.kind, 'anime_release');
  assert.equal(events[0].payload.title, 'Night Market');
  assert.equal(events[0].payload.siteUrl, 'https://anilist.co/anime/101');
  assert.equal(events[1].payload.kind, 'manga_release');
  assert.equal(events[1].payload.title, 'Paper Window');
  const packed = JSON.stringify(events);
  assert.equal(packed.includes(synopsis), false);
  assert.equal(packed.includes('evil.example'), false);
});

test('musicbrainz rows become new-song events and drop lyric bodies', () => {
  const music = source('dred-music');
  const now = new Date('2026-11-22T15:00:00.000Z');
  const url = new URL(musicBrainzUrl(music, now));
  assert.equal(url.origin, 'https://musicbrainz.org');
  assert.equal(url.pathname, '/ws/2/release/');
  const query = url.searchParams.get('query');
  assert.equal(query.includes('status:official'), true);
  assert.equal(query.includes('date:[2026-11-08 TO 2026-11-22]'), true);

  const events = parseMusicBrainz(fixture('musicbrainz'), music);
  assert.equal(events.length, 1);
  assert.equal(events[0].target, 'dred');
  assert.equal(events[0].payload.kind, 'new_song');
  assert.equal(events[0].payload.title, 'Glass Door');
  assert.equal(events[0].payload.artist, 'Sample');
  assert.equal(Object.hasOwn(events[0].payload, 'lyrics'), false);
  assert.equal(JSON.stringify(events).includes(lyric), false);
  assert.equal(USER_AGENT.includes('kinxdred'), true);
});

test('open-meteo uses the source coordinates and names the season from latitude', () => {
  const weather = source('shared-weather');
  const url = new URL(openMeteoUrl(weather));
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), String(weather.latitude));
  assert.equal(url.searchParams.get('longitude'), String(weather.longitude));
  assert.equal(url.searchParams.get('timezone'), weather.timezone);

  const events = parseOpenMeteo(fixture('open-meteo'), weather);
  assert.equal(events.length, 2);
  assert.equal(events[0].target, undefined);
  assert.equal(events[0].payload.kind, 'weather');
  assert.equal(events[0].payload.temperatureC, 4.2);
  assert.equal(events[0].payload.weatherCode, 3);
  assert.equal(events[1].payload.kind, 'season');
  assert.equal(events[1].payload.season, 'autumn');
  assert.equal(seasonName(11, weather.latitude), 'autumn');
  assert.equal(seasonName(11, -33.8), 'spring');
  assert.equal(seasonName(1, -33.8), 'summer');
});
