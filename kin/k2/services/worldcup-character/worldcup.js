// ═══════════════════════════════════════════
// worldcup.js — 캐릭터 월드컵
// ═══════════════════════════════════════════
import { getLang, t, KIN_IMGS, API_URL, SUPA_URL, SUPA_KEY, genUUID } from '../../lib/core.js';
import { initLangToggle, showError } from '../../lib/ui.js';

// ══════════════════════════════════════════
// 상수
// ══════════════════════════════════════════

const ROUND_NAMES = {
  ko: { 16: '16강', 8: '8강', 4: '4강', 2: '결승' },
  en: { 16: 'Round of 16', 8: 'Quarter-final', 4: 'Semi-final', 2: 'Final' },
};

// MBTI 매핑 테이블
const MBTI_MAP = {
  // E/I: 외향 vs 내향 — tone + archetype 기반
  E: {
    tone: ['playful', 'bright', 'warm'],
    archetype: ['wild_card', 'berserker', 'rebel', 'fighter', 'trickster'],
  },
  I: {
    tone: ['cool', 'dark', 'melancholy', 'mysterious'],
    archetype: ['stoic', 'mastermind', 'sage', 'seeker'],
  },
  // S/N: 감각 vs 직관 — trait 기반
  S: { trait: ['loyalty', 'instinct', 'willpower', 'empathy'] },
  N: { trait: ['intellect', 'chaos', 'freedom', 'obsession'] },
  // T/F: 사고 vs 감정 — trait + archetype
  T: {
    trait: ['pride', 'intellect', 'chaos'],
    archetype: ['mastermind', 'genius', 'stoic', 'trickster'],
  },
  F: {
    trait: ['empathy', 'sacrifice', 'loyalty'],
    archetype: ['guardian', 'healer', 'underdog', 'seeker'],
  },
  // J/P: 판단 vs 인식 — archetype 기반
  J: {
    archetype: ['guardian', 'leader', 'stoic', 'sage'],
    trait: ['loyalty', 'willpower', 'sacrifice'],
  },
  P: {
    archetype: ['wild_card', 'rebel', 'trickster', 'berserker'],
    trait: ['instinct', 'freedom', 'chaos'],
  },
};

// MBTI 유형별 한마디
const MBTI_COMMENT = {
  ko: {
    INTJ: '전략적인 캐릭터에 끌리는 설계자. 네가 고른 캐릭터들은 다 자기만의 계획이 있었어.',
    INTP: '조용히 세상을 분석하는 캐릭터를 좋아하는구나. 머릿속이 복잡한 캐릭터일수록 끌리지?',
    ENTJ: '카리스마 있는 리더형 캐릭터를 골랐네. 약한 모습보다 강한 결단이 좋은 거야.',
    ENTP: '예측 불가능하고 재치 있는 캐릭터를 좋아해. 틀을 깨는 캐릭터가 네 취향이야.',
    INFJ: '조용하지만 깊은 신념을 가진 캐릭터에 끌리는 거야. 겉으로 안 보여도 속은 뜨거운 사람들.',
    INFP: '이상을 쫓는 캐릭터에 약하구나. 순수한 마음을 지키려는 캐릭터일수록 마음이 가지?',
    ENFJ: '사람을 이끄는 따뜻한 캐릭터를 골랐어. 혼자 강한 것보다 함께 강한 쪽이 좋은 거지.',
    ENFP: '에너지 넘치고 자유로운 캐릭터를 좋아하네. 규칙보다 감정을 따르는 캐릭터가 네 픽이야.',
    ISTJ: '묵묵히 자기 길을 가는 캐릭터를 골랐어. 화려함보다 신뢰감에 끌리는 타입이야.',
    ISFJ: '지키려는 마음이 강한 캐릭터에 끌리네. 누군가를 위해 싸우는 모습에 약한 거지.',
    ESTJ: '강인한 의지로 팀을 이끄는 캐릭터를 좋아해. 결단력 있는 캐릭터가 멋있는 거야.',
    ESFJ: '동료를 챙기는 따뜻한 캐릭터에 끌리는구나. 혼자보다 함께일 때 빛나는 사람들.',
    ISTP: '과묵하지만 실력으로 보여주는 캐릭터를 골랐네. 말보다 행동이 강한 타입에 끌리지.',
    ISFP: '감성적이지만 조용히 자기 길을 가는 캐릭터를 좋아해. 자유로운 영혼에 끌리는 거야.',
    ESTP: '전투 본능과 행동력이 강한 캐릭터를 골랐어. 생각보다 몸이 먼저 움직이는 타입이 좋은 거지.',
    ESFP: '밝고 에너지 넘치는 캐릭터를 좋아하네. 분위기 메이커에 끌리는 타입이야.',
  },
  en: {
    INTJ: 'You pick strategists. Your characters all had a plan of their own.',
    INTP: "You like quiet analyzers. The more complex their mind, the more you're drawn in.",
    ENTJ: 'Charismatic leaders caught your eye. You respect decisive strength.',
    ENTP: 'Unpredictable, witty characters are your thing. Rule-breakers speak to you.',
    INFJ: "You're drawn to quiet conviction. Calm exterior, burning interior.",
    INFP: "You're weak for idealists. The purer the heart, the harder it hits.",
    ENFJ: "Warm leaders who unite others. Stronger together — that's your vibe.",
    ENFP: 'Free spirits with overflowing energy. You pick heart over rules.',
    ISTJ: 'Steady, reliable characters. You value trust over flash.',
    ISFJ: 'Protectors who fight for others. Self-sacrifice gets you every time.',
    ESTJ: 'Strong-willed leaders who take charge. Decisiveness is what you respect.',
    ESFJ: 'Warm team players. Characters who shine with others, not alone.',
    ISTP: "Quiet but deadly. Actions over words — that's what draws you in.",
    ISFP: 'Sensitive free spirits on their own path. You appreciate quiet freedom.',
    ESTP: 'Combat instinct and action. Characters who move before they think.',
    ESFP: "Bright, energetic mood-makers. You're drawn to the life of the party.",
  },
};

// archetype별 KIN 코멘트 소재
const ARCHETYPE_FLAVOR = {
  ko: {
    guardian: '지키려는 마음이 강한 사람',
    genius: '재능을 알아보는 눈이 있네',
    mastermind: '전략적인 캐릭터에 끌리는 거야',
    rebel: '체제에 맞서는 캐릭터를 좋아하는구나',
    stoic: '과묵한 강함에 끌리는 타입이야',
    berserker: '전투 본능에 반응하는 사람이네',
    underdog: '약자의 성장 서사에 약한 거지',
    leader: '리더십에 끌리는 타입이야',
    wild_card: '예측 불가능한 매력을 좋아하는구나',
    trickster: '재치와 반전을 즐기는 사람이네',
    seeker: '진실을 찾아가는 여정에 끌리는 거야',
    healer: '치유하는 존재에 공감하는 사람이야',
    sage: '지혜와 경험에 가치를 두는 타입이네',
    fighter: '순수한 전투력에 끌리는 거야',
  },
  en: {
    guardian: "You're drawn to protectors.",
    genius: 'You recognize raw talent when you see it.',
    mastermind: 'Strategic minds catch your eye.',
    rebel: 'You root for those who fight the system.',
    stoic: 'Quiet strength speaks to you.',
    berserker: 'Raw combat instinct resonates with you.',
    underdog: 'Underdog arcs get you every time.',
    leader: 'Leadership pulls you in.',
    wild_card: 'You like the unpredictable ones.',
    trickster: 'Wit and misdirection entertain you.',
    seeker: 'The search for truth draws you in.',
    healer: 'Healers resonate with you.',
    sage: 'You value wisdom and experience.',
    fighter: 'Pure fighting spirit draws you in.',
  },
};

const TRAIT_FLAVOR = {
  ko: {
    willpower: '의지력이 강한 캐릭터를 반복해서 골랐어.',
    pride: '자존심과 야망 — 그게 네 기준인 것 같아.',
    loyalty: '충성과 헌신에 끌리는 사람이야.',
    obsession: '집착하는 캐릭터에 공감하는 거지.',
    intellect: '두뇌 싸움을 즐기는 타입이네.',
    instinct: '본능적으로 움직이는 캐릭터를 좋아하는구나.',
    sacrifice: '희생의 무게를 아는 사람이야.',
    empathy: '공감 능력이 높은 캐릭터에 끌리네.',
    chaos: '혼돈 속에서 매력을 느끼는 타입이야.',
    freedom: '자유를 향한 갈망에 공감하는 거야.',
  },
  en: {
    willpower: 'You keep picking characters with unbreakable will.',
    pride: 'Pride and ambition — that seems to be your filter.',
    loyalty: 'Loyalty and devotion draw you in.',
    obsession: 'You relate to characters consumed by obsession.',
    intellect: "You're a fan of the mind game.",
    instinct: 'Instinct-driven characters speak to you.',
    sacrifice: 'You understand the weight of sacrifice.',
    empathy: 'Characters who heal others resonate with you.',
    chaos: 'You find beauty in chaos.',
    freedom: 'The yearning for freedom hits you hard.',
  },
};

const TONE_FLAVOR = {
  ko: {
    warm: '따뜻한 서사를 좋아하는 거야.',
    cool: '차분한 캐릭터에 끌리네.',
    dark: '어두운 이야기에 몰입하는 타입이야.',
    intense: '강렬한 에너지에 반응하는 사람이네.',
    tragic: '비극적인 캐릭터에 약한 거지.',
    mysterious: '미스터리한 매력에 끌리는 거야.',
    playful: '유쾌한 캐릭터가 좋은 거구나.',
  },
  en: {
    warm: 'You gravitate toward warmth.',
    cool: 'Cool composure catches your attention.',
    dark: 'Dark narratives pull you in.',
    intense: 'Intensity is your thing.',
    tragic: 'Tragic characters hit different for you.',
    mysterious: 'Mystery draws you in.',
    playful: 'You enjoy the playful ones.',
  },
};

// ══════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 한국어 조사 자동 선택
function getJosa(word, type) {
  if (!word) return type === '이/가' ? '이' : type === '을/를' ? '을' : '은';
  const code = word[word.length - 1].charCodeAt(0);
  const isKorean = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isKorean && (code - 0xac00) % 28 !== 0;
  if (type === '이/가') return hasBatchim ? '이' : '가';
  if (type === '을/를') return hasBatchim ? '을' : '를';
  if (type === '은/는') return hasBatchim ? '은' : '는';
  return '';
}

function getRoundLabel(round) {
  return (getLang() === 'ko' ? ROUND_NAMES.ko : ROUND_NAMES.en)[round] || `${round}강`;
}

// AniList 캐릭터 이미지 조회
async function fetchCharImage(char) {
  // 1. override_image_url 우선
  if (char.override_image_url) return char.override_image_url;

  // 2. anilist_id로 조회
  if (char.anilist_id) {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id:Int){Character(id:$id){image{large}}}`,
          variables: { id: char.anilist_id },
        }),
      });
      const data = await res.json();
      return data?.data?.Character?.image?.large || null;
    } catch {
      return null;
    }
  }

  // 3. 캐릭터 이름으로 AniList 검색 (fallback)
  if (char.name_en) {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($search:String){Character(search:$search){image{large}}}`,
          variables: { search: char.name_en },
        }),
      });
      const data = await res.json();
      return data?.data?.Character?.image?.large || null;
    } catch {
      return null;
    }
  }

  return null;
}

// ══════════════════════════════════════════
// 상태
// ══════════════════════════════════════════

const CATEGORIES = {
  all: {
    ko: '전체',
    en: 'All',
    desc_ko: '210명 전체에서 16명 랜덤',
    desc_en: '16 random from all 210',
  },
  protagonist: {
    ko: '주인공',
    en: 'Protagonist',
    desc_ko: '주인공 86명 중 16명',
    desc_en: '16 from 86 protagonists',
  },
  rival: {
    ko: '라이벌 & 악역',
    en: 'Rival & Villain',
    desc_ko: '라이벌·악역 78명 중 16명',
    desc_en: '16 from 78 rivals',
  },
  female: {
    ko: '여캐',
    en: 'Female',
    desc_ko: '여성 캐릭터 46명 중 16명',
    desc_en: '16 from 46 female chars',
  },
};

const state = {
  characters: [],
  roundMatches: [],
  currentMatch: 0,
  winners: [],
  round: 16,
  totalMatches: 15,
  matchPlayed: 0,
  sessionKey: genUUID(),
  top4: [],
  resultWinner: null,
  history: [],
  selecting: false,
  category: 'all',
};

// ══════════════════════════════════════════
// 화면 전환
// ══════════════════════════════════════════

function showSection(id) {
  ['wc-start', 'wc-arena', 'wc-result'].forEach((s) => {
    $(s).style.display = s === id ? '' : 'none';
  });
  if (id !== 'wc-arena') {
    $('h-title').textContent = getLang() === 'en' ? 'Character Worldcup' : '캐릭터 월드컵';
    $('wc-progress-text').style.display = 'none';
  }
}

// ══════════════════════════════════════════
// Supabase 로드
// ══════════════════════════════════════════

async function loadCharacters() {
  const res = await fetch(`${SUPA_URL}/rest/v1/worldcup_characters?is_active=eq.true&select=*`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error('Failed to load characters');
  return res.json();
}

// ══════════════════════════════════════════
// 캐릭터 선발 & 브라켓
// ══════════════════════════════════════════

function selectCharacters(chars) {
  // 같은 작품에서 최대 2명까지만
  const workCount = {};
  const eligible = chars.filter((c) => {
    workCount[c.work_ko] = (workCount[c.work_ko] || 0) + 1;
    return workCount[c.work_ko] <= 2;
  });

  const S = shuffle(eligible.filter((c) => c.popularity_tier === 'S'));
  const A = shuffle(eligible.filter((c) => c.popularity_tier === 'A'));
  const B = shuffle(eligible.filter((c) => c.popularity_tier === 'B'));

  // S급 6~8명, A급으로 채우고, 부족하면 B급
  const picked = [...S.slice(0, 8)];
  picked.push(...A.slice(0, 16 - picked.length));
  picked.push(...B.slice(0, 16 - picked.length));

  return shuffle(picked).slice(0, 16);
}

function buildBracket(chars) {
  const S = chars.filter((c) => c.popularity_tier === 'S');
  const rest = chars.filter((c) => c.popularity_tier !== 'S');
  const shuffledS = shuffle(S);
  const pool = shuffle(rest);
  const pairs = [];
  const paired = new Set();

  // S급끼리 바로 붙지 않도록 시딩
  for (let i = 0; i < 8; i++) {
    const s = shuffledS[i];
    if (s && !paired.has(s.id)) {
      const opp = pool.shift();
      if (opp) {
        pairs.push([s, opp]);
        paired.add(s.id);
        paired.add(opp.id);
      }
    }
  }

  const remaining = shuffle(chars.filter((c) => !paired.has(c.id)));
  for (let i = 0; i < remaining.length; i += 2) {
    if (remaining[i + 1]) pairs.push([remaining[i], remaining[i + 1]]);
  }

  return shuffle(pairs);
}

// ══════════════════════════════════════════
// 이미지 로드
// ══════════════════════════════════════════

const imgCache = new Map();

function randomBg() {
  return `url(/kin/k2/assets/bg/bg${Math.floor(Math.random() * 10) + 1}.png)`;
}

async function loadCharImgAnimated(char, bgEl, imgWrap) {
  let url = imgCache.get(char.id);
  if (!url) {
    url = await fetchCharImage(char).catch(() => null);
    if (url) imgCache.set(char.id, url);
  }
  bgEl.style.backgroundImage = url ? `url(${url})` : randomBg();
  await sleep(80);
  imgWrap?.classList.add('img-loaded');
}

// ══════════════════════════════════════════
// 매치 렌더
// ══════════════════════════════════════════

async function renderMatch() {
  const [charA, charB] = state.roundMatches[state.currentMatch];
  const isEn = getLang() === 'en';

  // 텍스트
  const lang = isEn ? 'en' : 'ko';
  $('wc-name-a').textContent = isEn ? charA.name_en : charA.name_ko;
  $('wc-work-a').textContent = isEn ? charA.work_en : charA.work_ko;
  $('wc-tag-a').textContent = isEn ? charA.tagline_en : charA.tagline_ko;
  // 속성 힌트
  const hintA = $('wc-hint-a');
  if (hintA) {
    const a1 = ARCHETYPE_LABEL[lang][charA.archetype] || '';
    const a2 = TRAIT_LABEL[lang][charA.trait] || '';
    hintA.textContent = [a1, a2].filter(Boolean).join(' · ');
  }

  $('wc-name-b').textContent = isEn ? charB.name_en : charB.name_ko;
  $('wc-work-b').textContent = isEn ? charB.work_en : charB.work_ko;
  $('wc-tag-b').textContent = isEn ? charB.tagline_en : charB.tagline_ko;
  const hintB = $('wc-hint-b');
  if (hintB) {
    const b1 = ARCHETYPE_LABEL[lang][charB.archetype] || '';
    const b2 = TRAIT_LABEL[lang][charB.trait] || '';
    hintB.textContent = [b1, b2].filter(Boolean).join(' · ');
  }

  // 글로벌 헤더
  $('h-title').textContent = getRoundLabel(state.round);
  const prog = $('wc-progress-text');
  prog.textContent = `${state.matchPlayed + 1} / ${state.totalMatches}`;
  prog.style.display = '';

  // 이미지 초기화
  const bgA = $('wc-bg-a'),
    bgB = $('wc-bg-b');
  const imgA = bgA?.closest('.wc-char-img');
  const imgB = bgB?.closest('.wc-char-img');
  if (bgA) bgA.style.backgroundImage = '';
  if (bgB) bgB.style.backgroundImage = '';
  imgA?.classList.remove('img-loaded');
  imgB?.classList.remove('img-loaded');

  // 카드/VS 리셋
  const ca = $('wc-char-a'),
    cb = $('wc-char-b'),
    vs = $('wc-vs');
  ['entered', 'wc-selected', 'wc-loser', 'wc-exit-left', 'wc-exit-right'].forEach((c) => {
    ca.classList.remove(c);
    cb.classList.remove(c);
  });
  vs.classList.remove('entered');
  ca.style.pointerEvents = '';
  cb.style.pointerEvents = '';

  // 이미지 로드 (애니메이션과 병렬)
  loadCharImgAnimated(charA, bgA, imgA);
  loadCharImgAnimated(charB, bgB, imgB);

  // 입장 애니메이션
  await sleep(40);
  ca.classList.add('entered');
  await sleep(100);
  cb.classList.add('entered');
  await sleep(150);
  vs.classList.add('entered');
}

// ══════════════════════════════════════════
// 선택 처리
// ══════════════════════════════════════════

async function selectChar(winnerChar, loserChar) {
  if (state.selecting) return;
  state.selecting = true;

  const [pairA] = state.roundMatches[state.currentMatch];
  const winnerEl = winnerChar === pairA ? $('wc-char-a') : $('wc-char-b');
  const loserEl = winnerChar === pairA ? $('wc-char-b') : $('wc-char-a');

  $('wc-char-a').style.pointerEvents = 'none';
  $('wc-char-b').style.pointerEvents = 'none';

  winnerEl.classList.add('wc-selected');
  loserEl.classList.add('wc-loser');
  await sleep(650);

  $('wc-char-a').classList.add('wc-exit-left');
  $('wc-char-b').classList.add('wc-exit-right');
  $('wc-vs').classList.remove('entered');
  await sleep(380);

  state.history.push({ round: state.round, winner: winnerChar, loser: loserChar });
  if (state.round === 4) state.top4.push(loserChar);

  state.winners.push(winnerChar);
  state.currentMatch++;
  state.matchPlayed++;
  state.selecting = false;

  if (state.currentMatch < state.roundMatches.length) {
    await renderMatch();
  } else if (state.winners.length === 1) {
    // 결승 종료
    state.top4 = [state.winners[0], loserChar, ...state.top4];
    state.resultWinner = state.winners[0];
    await showResult(state.winners[0]);
  } else {
    // 다음 라운드
    state.round = state.round / 2;
    state.roundMatches = [];
    for (let i = 0; i < state.winners.length; i += 2) {
      if (state.winners[i + 1]) state.roundMatches.push([state.winners[i], state.winners[i + 1]]);
    }
    state.winners = [];
    state.currentMatch = 0;
    await renderMatch();
  }
}

// ══════════════════════════════════════════
// 결과 화면
// ══════════════════════════════════════════

const resultImgCache = new Map();

async function loadResultImg(char, bgEl) {
  if (resultImgCache.has(char.id)) {
    bgEl.style.backgroundImage = `url(${resultImgCache.get(char.id)})`;
    return;
  }
  const url = await fetchCharImage(char).catch(() => null);
  bgEl.style.backgroundImage = url ? `url(${url})` : randomBg();
  if (url) resultImgCache.set(char.id, url);
}

// Top4 태그 패턴 분석
function analyzeTop4Tags() {
  const top4 = state.top4.slice(0, 4);
  const archetypes = {};
  const traits = {};
  const tones = {};

  top4.forEach((c) => {
    if (c.archetype) archetypes[c.archetype] = (archetypes[c.archetype] || 0) + 1;
    if (c.trait) traits[c.trait] = (traits[c.trait] || 0) + 1;
    if (c.tone) tones[c.tone] = (tones[c.tone] || 0) + 1;
  });

  const topArch = Object.entries(archetypes).sort((a, b) => b[1] - a[1])[0];
  const topTrait = Object.entries(traits).sort((a, b) => b[1] - a[1])[0];
  const topTone = Object.entries(tones).sort((a, b) => b[1] - a[1])[0];

  return {
    archetype: topArch ? topArch[0] : null,
    archetypeCount: topArch ? topArch[1] : 0,
    trait: topTrait ? topTrait[0] : null,
    traitCount: topTrait ? topTrait[1] : 0,
    tone: topTone ? topTone[0] : null,
    toneCount: topTone ? topTone[1] : 0,
    allArchetypes: archetypes,
    allTraits: traits,
    allTones: tones,
  };
}

// MBTI 계산 — Top 4 캐릭터의 태그를 종합
function calcMBTI() {
  const top4 = state.top4.slice(0, 4);
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  top4.forEach((c) => {
    // E/I
    if (MBTI_MAP.E.tone.includes(c.tone)) scores.E++;
    if (MBTI_MAP.I.tone.includes(c.tone)) scores.I++;
    if (MBTI_MAP.E.archetype.includes(c.archetype)) scores.E++;
    if (MBTI_MAP.I.archetype.includes(c.archetype)) scores.I++;
    // S/N
    if (MBTI_MAP.S.trait.includes(c.trait)) scores.S++;
    if (MBTI_MAP.N.trait.includes(c.trait)) scores.N++;
    // T/F
    if (MBTI_MAP.T.trait.includes(c.trait)) scores.T++;
    if (MBTI_MAP.T.archetype.includes(c.archetype)) scores.T++;
    if (MBTI_MAP.F.trait.includes(c.trait)) scores.F++;
    if (MBTI_MAP.F.archetype.includes(c.archetype)) scores.F++;
    // J/P
    if (MBTI_MAP.J.archetype.includes(c.archetype)) scores.J++;
    if (MBTI_MAP.J.trait.includes(c.trait)) scores.J++;
    if (MBTI_MAP.P.archetype.includes(c.archetype)) scores.P++;
    if (MBTI_MAP.P.trait.includes(c.trait)) scores.P++;
  });

  const type =
    (scores.E >= scores.I ? 'E' : 'I') +
    (scores.S >= scores.N ? 'S' : 'N') +
    (scores.T >= scores.F ? 'T' : 'F') +
    (scores.J >= scores.P ? 'J' : 'P');

  return { type, scores };
}

// archetype 한글 라벨
const ARCHETYPE_LABEL = {
  ko: {
    guardian: '수호자',
    genius: '천재',
    mastermind: '전략가',
    rebel: '반항아',
    stoic: '과묵',
    berserker: '광전사',
    underdog: '약체 성장',
    leader: '리더',
    wild_card: '변수',
    trickster: '트릭스터',
    seeker: '탐구자',
    healer: '치유자',
    sage: '현자',
    fighter: '전사',
  },
  en: {
    guardian: 'Guardian',
    genius: 'Genius',
    mastermind: 'Mastermind',
    rebel: 'Rebel',
    stoic: 'Stoic',
    berserker: 'Berserker',
    underdog: 'Underdog',
    leader: 'Leader',
    wild_card: 'Wild Card',
    trickster: 'Trickster',
    seeker: 'Seeker',
    healer: 'Healer',
    sage: 'Sage',
    fighter: 'Fighter',
  },
};

const TRAIT_LABEL = {
  ko: {
    willpower: '의지',
    pride: '자존심',
    loyalty: '충성',
    obsession: '집착',
    intellect: '지성',
    instinct: '본능',
    sacrifice: '희생',
    empathy: '공감',
    chaos: '혼돈',
    freedom: '자유',
  },
  en: {
    willpower: 'Willpower',
    pride: 'Pride',
    loyalty: 'Loyalty',
    obsession: 'Obsession',
    intellect: 'Intellect',
    instinct: 'Instinct',
    sacrifice: 'Sacrifice',
    empathy: 'Empathy',
    chaos: 'Chaos',
    freedom: 'Freedom',
  },
};

function getWcObs(winner, isEn) {
  const name = isEn ? winner.name_en : winner.name_ko;
  const tier = winner.popularity_tier;
  const tags = analyzeTop4Tags();
  const mbti = calcMBTI();
  const top4 = state.top4.slice(0, 4);

  // 결승 상대
  const finalMatch = state.history.find((h) => h.round === 2);
  const finalist = finalMatch ? (isEn ? finalMatch.loser.name_en : finalMatch.loser.name_ko) : null;

  // S급 상대를 꺾은 횟수
  const path = state.history.filter((h) => h.winner.id === winner.id);
  const sKills = path.filter((h) => h.loser.popularity_tier === 'S').length;

  // Top4 작품 다양성 체크
  const uniqueWorks = new Set(top4.map((c) => c.work_ko)).size;

  const lines = [];

  if (isEn) {
    // 결승 상대 언급
    if (finalist) {
      lines.push(
        pick([
          `${name} over ${finalist} in the final. That says a lot.`,
          `You chose ${name} over ${finalist}. Not a random call.`,
        ])
      );
    }

    // S급 격파
    if (sKills >= 2) {
      lines.push(`Took down ${sKills} S-tier picks on the way.`);
    }

    // 태그 패턴 — 우선순위: trait > archetype > tone
    if (tags.traitCount >= 2) {
      lines.push(TRAIT_FLAVOR.en[tags.trait] || '');
    } else if (tags.archetypeCount >= 2) {
      lines.push(ARCHETYPE_FLAVOR.en[tags.archetype] || '');
    }

    if (tags.toneCount >= 2) {
      lines.push(TONE_FLAVOR.en[tags.tone] || '');
    }

    // 작품 다양성 코멘트
    if (uniqueWorks === 4 && lines.length < 3) {
      lines.push('All from different worlds. You pick characters, not series.');
    }

    // tier 마무리
    if (lines.length < 2) {
      if (tier === 'S') lines.push('Classic pick. But the path here was uniquely yours.');
      else if (tier === 'A')
        lines.push("Not the obvious choice. That's a real preference showing.");
      else lines.push("This isn't about popularity. You're picking by feel.");
    }

    // MBTI 한마디
    lines.push(MBTI_COMMENT.en[mbti.type] || '');

    return lines.filter(Boolean).slice(0, 4).join(' ');
  }

  // ── 한국어 ──
  const ga = getJosa(name, '이/가');
  const eul = getJosa(name, '을/를');

  // 결승 상대
  if (finalist) {
    const fEul = getJosa(finalist, '을/를');
    lines.push(
      pick([
        `결승에서 ${finalist}${fEul} 제치고 ${name}${eul} 골랐구나.`,
        `${finalist} 대신 ${name}. 쉬운 선택은 아니었을 텐데.`,
      ])
    );
  }

  // S급 격파
  if (sKills >= 2) {
    lines.push(`오는 길에 S급을 ${sKills}명이나 꺾었어.`);
  }

  // 태그 패턴 — 트레이트 우선
  if (tags.traitCount >= 2) {
    lines.push(TRAIT_FLAVOR.ko[tags.trait] || '');
  } else if (tags.archetypeCount >= 2) {
    lines.push(ARCHETYPE_FLAVOR.ko[tags.archetype] || '');
  }

  if (tags.toneCount >= 2) {
    lines.push(TONE_FLAVOR.ko[tags.tone] || '');
  }

  // 작품 다양성
  if (uniqueWorks === 4 && lines.length < 3) {
    lines.push('전부 다른 작품에서 골랐네. 작품이 아니라 캐릭터를 보는 거야.');
  }

  // tier 마무리
  if (lines.length < 2) {
    if (tier === 'S') lines.push(`여기까지 오는 길이 더 흥미로워.`);
    else if (tier === 'A') lines.push(`더 유명한 캐릭터들 다 제치고 ${name}${ga} 남았어.`);
    else lines.push(`${name}${ga} 우승이라니. 인지도랑 상관없이 네 기준으로 고른 거야.`);
  }

  // MBTI 한마디
  lines.push(MBTI_COMMENT.ko[mbti.type] || '');

  return lines.filter(Boolean).slice(0, 4).join(' ');
}

function renderResultContent(isEn) {
  const winner = state.resultWinner;
  if (!winner) return;
  const second = state.top4[1];

  $('wc-result-eyebrow').textContent = isEn ? 'Your Pick' : '네가 선택한 캐릭터';
  $('wc-result-title').textContent = isEn ? winner.name_en : winner.name_ko;
  $('wc-result-work').textContent = isEn ? winner.work_en : winner.work_ko;

  loadResultImg(winner, $('wc-winner-bg'));
  $('wc-winner-tagline').textContent = isEn ? winner.tagline_en : winner.tagline_ko;

  if (second) {
    $('wc-second-label').textContent = isEn ? '🥈 Runner-up' : '🥈 준우승';
    $('wc-second-name').textContent = isEn ? second.name_en : second.name_ko;
    $('wc-second-work').textContent = isEn ? second.work_en : second.work_ko;
    $('wc-second-tagline').textContent = isEn ? second.tagline_en : second.tagline_ko;
    loadResultImg(second, $('wc-second-bg'));
    $('wc-second-card').style.display = '';
  }

  $('wc-obs-text').textContent = getWcObs(winner, isEn);
  $('wc-obs-avatar').src = KIN_IMGS.happy;

  // 태그 시각화
  const tags = analyzeTop4Tags();
  const lang = isEn ? 'en' : 'ko';
  const tagBadges = $('wc-tag-badges');
  if (tagBadges) {
    const badges = [];
    if (winner.archetype) badges.push(ARCHETYPE_LABEL[lang][winner.archetype] || winner.archetype);
    if (winner.trait) badges.push(TRAIT_LABEL[lang][winner.trait] || winner.trait);
    if (winner.tone) badges.push(winner.tone);
    tagBadges.innerHTML = badges.map((b) => `<span class="wc-badge">${b}</span>`).join('');
  }

  // MBTI 표시
  const mbti = calcMBTI();
  const mbtiEl = $('wc-mbti');
  if (mbtiEl) {
    mbtiEl.querySelector('.wc-mbti-type').textContent = mbti.type;
    mbtiEl.querySelector('.wc-mbti-desc').textContent = isEn
      ? `Your character taste says ${mbti.type}`
      : `너의 캐릭터 취향은 ${mbti.type}`;
    mbtiEl.style.display = '';
  }

  // Top4 태그 요약
  const profileEl = $('wc-taste-profile');
  if (profileEl) {
    const pTags = [];
    if (tags.traitCount >= 2) pTags.push(TRAIT_LABEL[lang][tags.trait]);
    if (tags.archetypeCount >= 2) pTags.push(ARCHETYPE_LABEL[lang][tags.archetype]);
    if (tags.toneCount >= 2) pTags.push(tags.tone);
    profileEl.innerHTML =
      pTags.length > 0
        ? `<span class="wc-profile-label">${isEn ? 'Your Top 4 Pattern' : 'Top 4 패턴'}</span>` +
          pTags.map((t) => `<span class="wc-badge wc-badge-pattern">${t}</span>`).join('')
        : '';
  }

  $('wc-btn-retry').textContent = isEn ? 'Try Again' : '다시 하기';
  $('wc-btn-share').textContent = isEn ? 'Share Card' : '카드 공유';
  $('wc-btn-bracket').textContent = isEn ? 'Bracket' : '대진표';
}

async function showResult(winner) {
  showSection('wc-result');
  state.resultWinner = winner;
  renderResultContent(getLang() === 'en');

  const tags = analyzeTop4Tags();

  // KIN 에이전트 이벤트
  fetch(`${API_URL}/api/kin/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'k2_manga',
      event_type: 'char_worldcup_completed',
      payload: {
        winner: winner.name_ko,
        winner_work: winner.work_ko,
        winner_trait: winner.trait || null,
        winner_archetype: winner.archetype || null,
        top4: state.top4
          .slice(0, 4)
          .map((c) => (c.name_ko === c.work_ko ? c.name_ko : `${c.name_ko}(${c.work_ko})`)),
        winner_tier: winner.popularity_tier,
        tags,
        category: state.category,
        lang: getLang(),
      },
    }),
  }).catch(() => {});

  // Supabase 세션 저장
  fetch(`${SUPA_URL}/rest/v1/worldcup_char_sessions`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      session_key: state.sessionKey,
      winner_id: winner.id,
      winner: winner.name_ko,
      top4: state.top4.slice(0, 4).map((c) => c.name_ko),
      top4_tags: { ...tags, mbti: calcMBTI().type, category: state.category },
      lang: getLang(),
    }),
  }).catch(() => {});
}

// ══════════════════════════════════════════
// 공유 카드
// ══════════════════════════════════════════

let shareBlob = null,
  shareBlobUrl = null;

// 외부 CDN 이미지를 CORS 우회하여 blob URL로 변환
// 1차: 프록시 경유 (/api/img-proxy), 2차: 직접 fetch
async function fetchImageAsBlob(url) {
  // AniList CDN이면 프록시 경유
  if (url && url.includes('s4.anilist.co')) {
    try {
      const proxyUrl = `/api/img-proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      /* 프록시 실패 시 직접 시도 */
    }
  }
  // 직접 fetch (프록시 없거나 비-AniList URL)
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

async function cropImageToDataUrl(url, targetW, targetH) {
  // CORS 우회: blob URL로 변환 후 로드
  const blobUrl = await fetchImageAsBlob(url);
  if (!blobUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      ctx.drawImage(img, (targetW - sw) / 2, (targetH - sh) / 2, sw, sh);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(null);
    };
    img.src = blobUrl;
  });
}

// 게임 중 캐시된 이미지 URL 우선 사용, 없으면 API 재호출
async function getCachedCharImage(char) {
  return imgCache.get(char.id) || (await fetchCharImage(char).catch(() => null));
}

async function generateResultShareImage() {
  if (!window.html2canvas) throw new Error('no html2canvas');
  const winner = state.resultWinner;
  const isEn = getLang() === 'en';

  $('sc-main-eyebrow').textContent = isEn
    ? 'My Pick · KIN Character Worldcup'
    : '내 픽 · KIN 캐릭터 월드컵';
  $('sc-main-title').textContent = isEn ? winner.name_en : winner.name_ko;
  $('sc-main-work').textContent = isEn ? winner.work_en : winner.work_ko;
  $('sc-main-mbti').textContent = calcMBTI().type;
  $('sc-main-obs').textContent = getWcObs(winner, isEn);

  const imgEl = $('sc-main-img');
  const coverUrl = await getCachedCharImage(winner);
  if (coverUrl) {
    const dataUrl = await cropImageToDataUrl(coverUrl, 375, 280);
    if (dataUrl) {
      await new Promise((r) => {
        imgEl.onload = r;
        imgEl.onerror = r;
        imgEl.src = dataUrl;
      });
    }
  }

  const canvas = await html2canvas($('sc-main'), {
    backgroundColor: '#080806',
    scale: 2,
    useCORS: true,
    logging: false,
    allowTaint: false,
  });
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}

async function generateBracketShareImage() {
  const isEn = getLang() === 'en';
  const winner = state.resultWinner;

  const r16 = state.history.filter((h) => h.round === 16);
  const r8 = state.history.filter((h) => h.round === 8);
  const r4 = state.history.filter((h) => h.round === 4);
  const r2 = state.history.filter((h) => h.round === 2);

  const wIdx16 = r16.findIndex((h) => h.winner.id === winner.id);
  const wIdx8 = r8.findIndex((h) => h.winner.id === winner.id);
  const wIdx4 = r4.findIndex((h) => h.winner.id === winner.id);

  // 커버 이미지 미리 로드 (캐시 우선 → CORS 우회)
  const loadImg = async (char) => {
    const url = await getCachedCharImage(char);
    if (!url) return null;
    const blobUrl = await fetchImageAsBlob(url);
    if (!blobUrl) return null;
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        res(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        res(null);
      };
      img.src = blobUrl;
    });
  };

  const bracketImgCache = new Map();
  const toLoad = [];
  if (r2[0]) toLoad.push(r2[0].winner, r2[0].loser);
  r4.forEach((m) => toLoad.push(m.winner, m.loser));
  await Promise.all(
    [...new Set(toLoad)].map(async (c) => {
      if (c && !bracketImgCache.has(c.id)) bracketImgCache.set(c.id, await loadImg(c));
    })
  );

  // Canvas 설정
  const W = 1200,
    H = 760;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const Y = { final: 130, sf: 290, qf: 430, r16: 560, footer: 720 };
  const slotW = W / 8;
  const xR16 = Array.from({ length: 8 }, (_, i) => slotW * (i + 0.5));
  const xR8 = [0, 1, 2, 3].map((i) => (xR16[i * 2] + xR16[i * 2 + 1]) / 2);
  const xR4 = [0, 1].map((i) => (xR8[i * 2] + xR8[i * 2 + 1]) / 2);
  const xR2 = (xR4[0] + xR4[1]) / 2;

  const COL = {
    bg: '#080806',
    yellow: '#FFE500',
    text: 'rgba(255,255,255,.85)',
    muted: 'rgba(255,255,255,.4)',
    lineWin: '#FFE500',
    lineLose: 'rgba(255,255,255,.18)',
  };

  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  // 헤더
  ctx.font = '500 12px "DM Mono"';
  ctx.fillStyle = 'rgba(255,229,0,.5)';
  ctx.textAlign = 'left';
  ctx.fillText(
    (isEn ? 'MY BRACKET · KIN CHARACTER WORLDCUP' : '대진표 · KIN 캐릭터 월드컵').toUpperCase(),
    32,
    36
  );

  // 직각 연결선
  function drawBracketConn(px, pyBot, c1x, c2x, cyTop, isPath1, isPath2) {
    const midY = (pyBot + cyTop) / 2;
    const winX = isPath1 ? c1x : isPath2 ? c2x : null;

    ctx.beginPath();
    ctx.moveTo(Math.min(c1x, c2x), midY);
    ctx.lineTo(Math.max(c1x, c2x), midY);
    ctx.strokeStyle = COL.lineLose;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(px, pyBot);
    ctx.lineTo(px, midY);
    ctx.strokeStyle = winX !== null ? COL.lineWin : COL.lineLose;
    ctx.lineWidth = winX !== null ? 2.5 : 1;
    ctx.stroke();

    if (winX !== null) {
      ctx.beginPath();
      ctx.moveTo(winX, midY);
      ctx.lineTo(px, midY);
      ctx.strokeStyle = COL.lineWin;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(c1x, cyTop);
    ctx.lineTo(c1x, midY);
    ctx.strokeStyle = isPath1 ? COL.lineWin : COL.lineLose;
    ctx.lineWidth = isPath1 ? 2.5 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(c2x, cyTop);
    ctx.lineTo(c2x, midY);
    ctx.strokeStyle = isPath2 ? COL.lineWin : COL.lineLose;
    ctx.lineWidth = isPath2 ? 2.5 : 1;
    ctx.stroke();

    [c1x, c2x].forEach((cx) => {
      ctx.beginPath();
      ctx.arc(cx, midY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = cx === winX ? COL.lineWin : 'rgba(255,255,255,.2)';
      ctx.fill();
    });
  }

  drawBracketConn(xR2, Y.final + 68, xR4[0], xR4[1], Y.sf - 46, wIdx4 === 0, wIdx4 === 1);
  drawBracketConn(xR4[0], Y.sf + 46, xR8[0], xR8[1], Y.qf - 22, wIdx8 === 0, wIdx8 === 1);
  drawBracketConn(xR4[1], Y.sf + 46, xR8[2], xR8[3], Y.qf - 22, wIdx8 === 2, wIdx8 === 3);
  [0, 1, 2, 3].forEach((i) => {
    drawBracketConn(
      xR8[i],
      Y.qf + 20,
      xR16[i * 2],
      xR16[i * 2 + 1],
      Y.r16 - 16,
      wIdx16 === i * 2,
      wIdx16 === i * 2 + 1
    );
  });

  // 원형 이미지
  async function drawCircle(char, x, y, r, isWinner) {
    const img = char ? bracketImgCache.get(char.id) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (img) {
      ctx.clip();
      const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
      const sw = img.width * scale,
        sh = img.height * scale;
      ctx.drawImage(img, x - sw / 2, y - sh / 2, sw, sh);
    } else {
      ctx.fillStyle = '#1a1a14';
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isWinner ? COL.yellow : 'rgba(255,229,0,.3)';
    ctx.lineWidth = isWinner ? 2.5 : 1.5;
    ctx.stroke();
  }

  function drawName(char, x, y, isWinner) {
    const name = char ? (isEn ? char.name_en : char.name_ko) : '?';
    ctx.font = `${isWinner ? '700' : '400'} 12px sans-serif`;
    ctx.fillStyle = isWinner ? COL.yellow : COL.muted;
    ctx.textAlign = 'center';
    ctx.fillText(name.length > 8 ? name.slice(0, 7) + '…' : name, x, y);
  }

  // 결승
  if (r2[0]) {
    await drawCircle(r2[0].winner, xR2 - 76, Y.final, 64, true);
    drawName(r2[0].winner, xR2 - 76, Y.final + 84, true);
    await drawCircle(r2[0].loser, xR2 + 76, Y.final, 48, false);
    drawName(r2[0].loser, xR2 + 76, Y.final + 66, false);
    ctx.font = '500 12px "DM Mono"';
    ctx.fillStyle = 'rgba(255,229,0,.4)';
    ctx.textAlign = 'center';
    ctx.fillText(isEn ? 'FINAL' : '결승', xR2, Y.final - 76);
  }

  // 4강
  for (let i = 0; i < r4.length; i++) {
    const m = r4[i];
    const isWinPath = i === wIdx4;
    await drawCircle(m.winner, xR4[i] - 50, Y.sf, 42, isWinPath);
    drawName(m.winner, xR4[i] - 50, Y.sf + 58, isWinPath);
    await drawCircle(m.loser, xR4[i] + 50, Y.sf, 30, false);
    drawName(m.loser, xR4[i] + 50, Y.sf + 44, false);
  }
  ctx.font = '500 12px "DM Mono"';
  ctx.fillStyle = 'rgba(255,229,0,.35)';
  ctx.textAlign = 'left';
  ctx.fillText(isEn ? 'SEMI' : '4강', 32, Y.sf - 58);

  // 8강
  ctx.fillText(isEn ? 'QTR' : '8강', 32, Y.qf - 18);
  r8.forEach((m, i) => {
    const isPath = i === wIdx8;
    const wName = isEn ? m.winner.name_en : m.winner.name_ko;
    const lName = isEn ? m.loser.name_en : m.loser.name_ko;
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = isPath ? COL.yellow : 'rgba(255,255,255,.55)';
    ctx.textAlign = 'center';
    ctx.fillText(wName.length > 7 ? wName.slice(0, 6) + '…' : wName, xR8[i], Y.qf);
    ctx.font = '400 11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillText(lName.length > 7 ? lName.slice(0, 6) + '…' : lName, xR8[i], Y.qf + 16);
  });

  // 16강
  ctx.font = '500 12px "DM Mono"';
  ctx.fillStyle = 'rgba(255,229,0,.3)';
  ctx.textAlign = 'left';
  ctx.fillText(isEn ? 'R16' : '16강', 32, Y.r16 - 14);
  r16.forEach((m, i) => {
    const isPath = i === wIdx16;
    const wName = isEn ? m.winner.name_en : m.winner.name_ko;
    const lName = isEn ? m.loser.name_en : m.loser.name_ko;
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = isPath ? COL.yellow : 'rgba(255,255,255,.45)';
    ctx.textAlign = 'center';
    ctx.fillText(wName.length > 6 ? wName.slice(0, 5) + '…' : wName, xR16[i], Y.r16);
    ctx.font = '400 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillText(lName.length > 6 ? lName.slice(0, 5) + '…' : lName, xR16[i], Y.r16 + 14);
  });

  // 구분선
  ctx.beginPath();
  ctx.moveTo(32, Y.footer - 24);
  ctx.lineTo(W - 32, Y.footer - 24);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // URL 푸터
  ctx.font = '400 11px "DM Mono"';
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.textAlign = 'left';
  ctx.fillText('kinxdred.com/kin/k2', 32, Y.footer);

  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}

async function openShareModal(generateFn, type = 'card') {
  const modal = $('wc-share-modal');
  const loading = $('wc-share-loading');
  const imgEl = $('wc-share-img');
  const btns = $('wc-share-btns');

  modal.classList.remove('wc-share-modal--card', 'wc-share-modal--bracket');
  modal.classList.add('open', `wc-share-modal--${type}`);
  loading.style.display = 'block';
  imgEl.style.display = 'none';
  btns.style.display = 'none';

  try {
    shareBlob = await generateFn();
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl = URL.createObjectURL(shareBlob);
    imgEl.src = shareBlobUrl;
    imgEl.style.display = 'block';
    btns.style.display = 'flex';
  } catch {
    modal.classList.remove('open');
  } finally {
    loading.style.display = 'none';
  }
}

// ══════════════════════════════════════════
// lang 전환
// ══════════════════════════════════════════

function applyLang(l) {
  const isEn = l === 'en';
  $('h-title').textContent = isEn ? 'Character Worldcup' : '캐릭터 월드컵';

  // 카테고리 버튼 텍스트 업데이트
  document.querySelectorAll('.wc-cat-btn').forEach((btn) => {
    const cat = CATEGORIES[btn.dataset.cat];
    if (cat) btn.textContent = isEn ? cat.en : cat.ko;
  });
  updateStartDesc();
  $('wc-btn-start').textContent = isEn ? 'Start' : '시작하기';

  if (
    !state.selecting &&
    state.roundMatches.length > 0 &&
    state.currentMatch < state.roundMatches.length
  ) {
    renderMatch();
    return;
  }

  if (state.resultWinner) renderResultContent(isEn);
}

// ══════════════════════════════════════════
// 이벤트 리스너
// ══════════════════════════════════════════

// 카테고리 선택
function initCategoryButtons() {
  document.querySelectorAll('.wc-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wc-cat-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.cat;
      updateStartDesc();
    });
  });
}

function updateStartDesc() {
  const isEn = getLang() === 'en';
  const cat = CATEGORIES[state.category];
  $('wc-start-desc').textContent = isEn ? cat.desc_en : cat.desc_ko;
}

// 시작 버튼
$('wc-btn-start').addEventListener('click', async () => {
  showSection('wc-arena');

  try {
    let allChars = await loadCharacters();
    // 카테고리 필터
    if (state.category !== 'all') {
      allChars = allChars.filter((c) => c.category === state.category);
    }
    const selected = selectCharacters(allChars);
    if (selected.length < 16) throw new Error('not enough characters');

    const pairs = buildBracket(selected);
    Object.assign(state, {
      characters: selected,
      roundMatches: pairs,
      totalMatches: 15,
      round: 16,
      currentMatch: 0,
      winners: [],
      matchPlayed: 0,
      top4: [],
      history: [],
      selecting: false,
    });

    await renderMatch();
  } catch {
    showError(t('캐릭터를 불러오지 못했어.', 'Could not load characters.'));
    showSection('wc-start');
  }
});

// 카드 클릭
$('wc-char-a').addEventListener('click', () => {
  if (!state.roundMatches[state.currentMatch]) return;
  const [charA, charB] = state.roundMatches[state.currentMatch];
  selectChar(charA, charB);
});
$('wc-char-b').addEventListener('click', () => {
  if (!state.roundMatches[state.currentMatch]) return;
  const [charA, charB] = state.roundMatches[state.currentMatch];
  selectChar(charB, charA);
});

// 공유 버튼
$('wc-btn-share').addEventListener('click', () => openShareModal(generateResultShareImage, 'card'));
$('wc-btn-bracket').addEventListener('click', () =>
  openShareModal(generateBracketShareImage, 'bracket')
);

$('wc-share-modal-close').addEventListener('click', () =>
  $('wc-share-modal').classList.remove('open')
);
$('wc-share-modal').addEventListener('click', (e) => {
  if (e.target === $('wc-share-modal')) $('wc-share-modal').classList.remove('open');
});

$('wc-btn-share-save').addEventListener('click', async () => {
  if (!shareBlob) return;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    try {
      const file = new File([shareBlob], 'kin-char-worldcup.png', { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: getLang() === 'en' ? 'KIN Character Worldcup' : 'KIN 캐릭터 월드컵',
      });
    } catch {
      window.open(shareBlobUrl, '_blank');
    }
  } else {
    const a = document.createElement('a');
    a.href = shareBlobUrl;
    a.download = 'kin-char-worldcup.png';
    a.click();
  }
});

$('wc-btn-share-native').addEventListener('click', async () => {
  if (!shareBlob) return;
  const file = new File([shareBlob], 'kin-char-worldcup.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'KIN 캐릭터 월드컵',
        text: 'kinxdred.com/kin/k2',
      });
    } else {
      await navigator.share({ title: 'KIN 캐릭터 월드컵', url: 'https://kinxdred.com/kin/k2' });
    }
  } catch {
    /* 사용자 취소 */
  }
});

// 다시 하기
$('wc-btn-retry').addEventListener('click', () => {
  Object.assign(state, {
    characters: [],
    roundMatches: [],
    winners: [],
    top4: [],
    round: 16,
    currentMatch: 0,
    matchPlayed: 0,
    resultWinner: null,
    history: [],
    selecting: false,
    sessionKey: genUUID(),
  });
  imgCache.clear();
  resultImgCache.clear();
  showSection('wc-start');
});

// ══════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════

initLangToggle(applyLang);
initCategoryButtons();

(async () => {
  $('wc-loading').style.display = 'none';
  showSection('wc-start');
  applyLang(getLang());
})();
