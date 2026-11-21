/* Client-side port of d2-api RuleBasedSelector.
   Track rows: [artist, title, genre, spotify_id, tagBits].
   tagBits follows D2_KEYWORDS order, built from d2_tags_result.json
   (keywords outside that list were dropped, same as clean_tags.py). */

var D2_KEYWORDS = [
  '퇴근하는 길', '새벽인데', '밥은 혼자', '잠이 안 와', '그냥 걷고 싶어',
  '어딘가 가는 중', '그냥 지쳤어', '멍때리는 중', '뭔가 놓친 것 같아', '할 말이 있는데',
  '결정을 못 하겠어', '괜찮다고 했는데', '끝난 것 같은데', '이유 없이 별로', '설레면 안 되는데',
];

var D2_LINES = {
  ko: {
    '퇴근하는 길': ['일이 끝났는데 길은 아직이다.', '집 방향. 속도는 없음.'],
    '새벽인데': ['시계만 움직이고 있다.', '이 시간은 설명이 필요 없다.'],
    '밥은 혼자': ['식사는 소리 없이 끝난다.', '자리 하나. 충분하다.'],
    '잠이 안 와': ['눈이 안 감긴다. 그게 전부다.', '밤은 긴데 잠은 짧다.'],
    '그냥 걷고 싶어': ['목적지는 없다. 발만 있다.', '걷기만 하면 된다.'],
    '어딘가 가는 중': ['방향은 있는데 이유는 없다.', '이동 중. 도착은 나중.'],
    '그냥 지쳤어': ['힘이 빠진 상태. 이유 없음.', '오늘은 여기까지다.'],
    '멍때리는 중': ['생각이 멈춘 자리.', '비어 있는 게 아니라 정지다.'],
    '뭔가 놓친 것 같아': ['지나간 게 하나 있다.', '손에 안 남은 게 있다.'],
    '할 말이 있는데': ['말은 아직 입 밖에 없다.', '문장이 목에 있다.'],
    '결정을 못 하겠어': ['갈림길에서 서 있다.', '고르지 않은 채로 시간이 간다.'],
    '괜찮다고 했는데': ['괜찮다는 말만 남았다.', '그 문장은 비어 있다.'],
    '끝난 것 같은데': ['끝난 것 같은 자리.', '끝이라고 하기엔 아직 조용하다.'],
    '이유 없이 별로': ['이유가 없는 불쾌.', '기분만 아래로 있다.'],
    '설레면 안 되는데': ['들뜬 게 먼저 왔다.', '마음만 앞서 있다.'],
  },
  en: {
    '퇴근하는 길': ['the shift ended. the road did not.', 'toward home. no pace.'],
    '새벽인데': ['the clock moved. nothing else did.', 'this hour needs no reason.'],
    '밥은 혼자': ['the meal ends without noise.', 'one seat. enough.'],
    '잠이 안 와': ['eyes stay open. that is all.', 'a long night. a short sleep.'],
    '그냥 걷고 싶어': ['no destination. just the feet.', 'walking is the whole plan.'],
    '어딘가 가는 중': ['a direction. no reason attached.', 'in transit. arrival later.'],
    '그냥 지쳤어': ['nothing left for today.', 'energy gone. no cause.'],
    '멍때리는 중': ['thought stopped. the room did not.', 'a pause, not a blank.'],
    '뭔가 놓친 것 같아': ['something passed. it did not stay.', 'a piece did not remain.'],
    '할 말이 있는데': ['the sentence stays unsaid.', 'words, still in the throat.'],
    '결정을 못 하겠어': ['the split stays unresolved.', 'time moves. the choice does not.'],
    '괜찮다고 했는데': ['fine was the whole sentence.', 'that word stayed empty.'],
    '끝난 것 같은데': ['it sounds finished. it is quiet.', 'over, and still not loud.'],
    '이유 없이 별로': ['no cause. the mood dropped.', 'unpleasant, with no reason.'],
    '설레면 안 되는데': ['the lift arrived early.', 'the feeling went first.'],
  },
};

var D2_RANDOM = {
  ko: ['고르지 않은 곡.', '순서 없이 이거다.', '말이 필요 없는 쪽.'],
  en: ['no request. this one.', 'unordered. this track.', 'nothing asked. here.'],
};

var D2_FALLBACK = {
  ko: ['이 곡이다.', '말 없이 이거.'],
  en: ['this one.', 'no comment. this.'],
};

function d2Hash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function d2Unpack(row) {
  var bits = row[4] || 0;
  var tags = [];
  for (var i = 0; i < D2_KEYWORDS.length; i++) {
    if (bits & (1 << i)) tags.push(D2_KEYWORDS[i]);
  }
  return {
    artist: row[0],
    title: row[1],
    genre: row[2],
    spotify_id: row[3],
    id: row[3],
    tags: tags,
  };
}

var _d2Tracks = null;

function loadD2Tracks() {
  if (_d2Tracks) return _d2Tracks;
  _d2Tracks = fetch(asset('/data/d2-tracks.json'))
    .then(function (res) {
      if (!res.ok) throw new Error('tracks');
      return res.json();
    })
    .then(function (rows) { return rows.map(d2Unpack); });
  return _d2Tracks;
}

function d2Pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/* Same order as the old API: AND match, then OR match, then any track. */
function d2Select(tracks, tags, isRandom) {
  if (!tracks.length) return null;
  if (isRandom || !tags || !tags.length) return d2Pick(tracks);

  var and = tracks.filter(function (t) {
    return tags.every(function (tag) { return t.tags.indexOf(tag) !== -1; });
  });
  if (and.length) return d2Pick(and);

  var or = tracks.filter(function (t) {
    return t.tags.some(function (tag) { return tags.indexOf(tag) !== -1; });
  });
  if (or.length) return d2Pick(or);

  return d2Pick(tracks);
}

function d2Line(track, tags, lang, isRandom) {
  var table = lang === 'en' ? 'en' : 'ko';
  var pool;
  if (isRandom || !tags || !tags.length) pool = D2_RANDOM[table];
  else pool = D2_LINES[table][tags[0]] || D2_FALLBACK[table];
  var n = d2Hash((track.spotify_id || '') + '|' + (tags || []).join(',') + '|' + table);
  return pool[n % pool.length];
}

function d2Recommend(tracks, tags, lang, isRandom) {
  var track = d2Select(tracks, tags, isRandom);
  if (!track) throw new Error('no track');
  return {
    track: {
      id: track.id,
      artist: track.artist,
      title: track.title,
      spotify_id: track.spotify_id,
      genre: track.genre,
    },
    dred_line: d2Line(track, tags, lang, isRandom),
    lang: lang,
  };
}
