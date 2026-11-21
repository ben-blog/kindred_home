/* Deterministic D14 lines. Moon math matches d2-api utils/astronomy.js.
   Northern hemisphere, same fallback the old API used when location failed.
   A date + period + language always yields the same sentence. */

function d14Period(hour) {
  if (hour >= 2 && hour < 5) return 0;
  if (hour >= 5 && hour < 8) return 1;
  if (hour >= 8 && hour < 12) return 2;
  if (hour >= 12 && hour < 14) return 3;
  if (hour >= 14 && hour < 18) return 4;
  if (hour >= 18 && hour < 21) return 5;
  return 6;
}

var D14_PERIOD = {
  ko: ['새벽', '이른 아침', '오전', '점심', '오후', '저녁', '밤'],
  en: ['dawn', 'early morning', 'morning', 'noon', 'afternoon', 'evening', 'night'],
};

/* Index matches astronomy.js thresholds. Phrases are noun-or-clause forms
   that can sit after "달은" / as a short English fragment. */
var D14_MOON = [
  { ko: '그믐이다', en: 'new moon' },
  { ko: '초승달이다', en: 'a crescent' },
  { ko: '반달이다', en: 'quarter moon' },
  { ko: '보름에 가깝다', en: 'nearly full' },
  { ko: '보름이다', en: 'full moon' },
  { ko: '기울고 있다', en: 'waning moon' },
  { ko: '하현의 반달이다', en: 'last quarter' },
  { ko: '그믐에 가깝다', en: 'nearly new' },
];

var D14_SEASON = {
  north: {
    ko: ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'],
    en: ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'],
  },
  south: {
    ko: ['여름', '여름', '가을', '가을', '가을', '겨울', '겨울', '겨울', '봄', '봄', '봄', '여름'],
    en: ['summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer'],
  },
};

function d14MoonIndex(date) {
  var knownNew = new Date(2000, 0, 6);
  var diff = (date - knownNew) / (1000 * 60 * 60 * 24);
  var cycle = 29.53058867;
  var phase = ((diff % cycle) + cycle) % cycle;
  var thresholds = [1.85, 7.38, 9.22, 14.77, 16.61, 22.15, 23.99, 29.53];
  var idx = -1;
  for (var i = 0; i < thresholds.length; i++) {
    if (phase < thresholds[i]) { idx = i; break; }
  }
  return idx === -1 ? 0 : idx;
}

function d14Season(month, hemisphere) {
  var h = hemisphere === 'south' ? 'south' : 'north';
  var i = Math.min(11, Math.max(0, month - 1));
  return { ko: D14_SEASON[h].ko[i], en: D14_SEASON[h].en[i] };
}

function d14Hash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Three skeletons per period. Time, season, and moon are always in the sentence. */
var D14_TEMPLATES = {
  ko: [
    ['{hour}시. {season} {period}. 달은 {moon}.', '{season} {period}, {hour}시. 달은 {moon}.', '{period} {hour}시. {season}. 달은 {moon}.'],
    ['{hour}시. {season}의 {period}. 달은 {moon}.', '{season} {period}. {hour}시, 달은 {moon}.', '{period}. {season}. 달은 {moon}.'],
    ['{hour}시 {period}. {season}. 달은 {moon}.', '{season} {period}, {hour}시. 달은 {moon}.', '{period}의 {season}. {hour}시. 달은 {moon}.'],
    ['{hour}시 {period}. {season}. 달은 {moon}.', '{season} {period}. 달은 {moon}.', '{period}, {hour}시. {season}. 달은 {moon}.'],
    ['{hour}시. {season} {period}. 달은 {moon}.', '{season} {period} {hour}시. 달은 {moon}.', '{period}. {hour}시. {season}. 달은 {moon}.'],
    ['{hour}시 {period}. {season}. 달은 {moon}.', '{season} {period}. 달은 {moon}.', '{period} {hour}시. {season}. 달은 {moon}.'],
    ['{hour}시. {season} {period}. 달은 {moon}.', '{season}의 {period}, {hour}시. 달은 {moon}.', '{period}. {season}. {hour}시. 달은 {moon}.'],
  ],
  en: [
    ['{hour}:00. {season} {period}. {moon}.', '{period}. {season}. {moon}.', '{season} {period}, {hour}:00. {moon}.'],
    ['{hour}:00. {season} {period}. {moon}.', '{period}, {season}. {moon}.', '{season}. {hour}:00. {moon}.'],
    ['{hour}:00 {period}. {season}. {moon}.', '{season} {period}. {moon}.', '{period}. {season}, {hour}:00. {moon}.'],
    ['{hour}:00. {season} {period}. {moon}.', '{period}. {season}. {moon}.', '{season} {period}. {moon}.'],
    ['{hour}:00 {period}. {season}. {moon}.', '{season} {period}. {moon}.', '{period}, {hour}:00. {season}. {moon}.'],
    ['{hour}:00. {season} {period}. {moon}.', '{period}. {season}. {moon}.', '{season} {period}, {hour}:00. {moon}.'],
    ['{hour}:00. {season} {period}. {moon}.', '{period}. {season}. {moon}.', '{season} {period}. {hour}:00. {moon}.'],
  ],
};

function d14Message(date, lang, hemisphere) {
  var table = lang === 'en' ? 'en' : 'ko';
  var hour = date.getHours();
  var period = d14Period(hour);
  var moon = D14_MOON[d14MoonIndex(date)];
  var season = d14Season(date.getMonth() + 1, hemisphere);
  var key = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + '|' + period + '|' + table;
  var skeletons = D14_TEMPLATES[table][period];
  var tpl = skeletons[d14Hash(key) % skeletons.length];
  var hh = String(hour).padStart(2, '0');
  var line = tpl
    .replace(/\{hour\}/g, table === 'en' ? String(hour) : hh)
    .replace(/\{period\}/g, D14_PERIOD[table][period])
    .replace(/\{season\}/g, season[table])
    .replace(/\{moon\}/g, moon[table]);
  return { message: line, period: period, lang: table, moon: moon[table], season: season[table] };
}
