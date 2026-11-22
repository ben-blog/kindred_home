import { fetchAnilist } from './anilist.js';
import { fetchMusicBrainz } from './musicbrainz.js';
import { fetchOpenMeteo } from './open-meteo.js';

const providers = {
  anilist: (source, fetchImpl, now) => fetchAnilist(source, fetchImpl, now),
  musicbrainz: (source, fetchImpl, now) => fetchMusicBrainz(source, fetchImpl, now),
  'open-meteo': (source, fetchImpl) => fetchOpenMeteo(source, fetchImpl),
};

/** Dispatch on `source.provider`. Character names are not a branch. */
export function fetchSource(source, fetchImpl, now) {
  const run = providers[source?.provider];
  if (!run) return Promise.reject(new Error('provider'));
  return run(source, fetchImpl, now);
}
