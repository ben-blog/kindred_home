// ═══════════════════════════════════════════
// worldcup.js — 작품 월드컵
// ═══════════════════════════════════════════
import {
  getLang, t,
  KIN_IMGS, API_URL,
  SUPA_URL, SUPA_KEY,
  fetchAniListCover, genUUID,
} from '../../lib/core.js';
import { initLangToggle, showError } from '../../lib/ui.js';

// ══════════════════════════════════════════
// 상수
// ══════════════════════════════════════════

const ROUND_NAMES = {
  ko: { 16:'16강', 8:'8강', 4:'4강', 2:'결승' },
  en: { 16:'Round of 16', 8:'Quarter-final', 4:'Semi-final', 2:'Final' },
};

const WORK_QUOTES = {
  ko: {
    '원피스':              '"나는 왕이 될 거야!" — 몽키 D. 루피',
    '나루토':              '"포기하지 않는 것, 그게 나의 닌도야." — 우즈마키 나루토',
    '블리치':              '"지키고 싶은 게 있어서 강해지는 거야." — 쿠로사키 이치고',
    '진격의 거인':         '"싸워라. 이 세계에서 살아남고 싶다면." — 에렌 예거',
    '드래곤볼':            '"강한 놈이랑 싸우는 게 제일 좋아." — 손오공',
    '강철의 연금술사':     '"등가교환. 그것이 연금술의 기본 법칙이다." — 에드워드 엘릭',
    '헌터×헌터':           '"한계를 정해 두면 그게 진짜 한계가 된다." — 킬루아 조르딕',
    '귀멸의 칼날':         '"지지 않을 거야. 절대로." — 카마도 탄지로',
    '주술회전':            '"올바른 죽음을 위해 나는 싸운다." — 이타도리 유지',
    '슬램덩크':            '"왼손은 거들 뿐." — 미츠이 히사시',
    '하이큐':              '"지금 이 순간도, 어딘가에서 공은 튀기고 있다." — 히나타 쇼요',
    '체인소맨':            '"악마를 잡으면 뭐든 살 수 있어." — 덴지',
    '단다단':              '"믿어줘서 고마워." — 오카론',
    '원펀맨':              '"영웅 활동은 취미야." — 사이타마',
    '괴수8호':             '"나는 반드시 방위대에 들어간다." — 카프카 히비노',
    '블루록':              '"자신을 세계 최강의 이기주의자라고 불러라." — 이기',
    '나의 히어로 아카데미아': '"네가 할 수 있다고 말해줬으니까." — 미도리야 이즈쿠',
    '페어리테일':          '"동료는 마법보다 강하다." — 나츠 드래그닐',
    '블랙 클로버':         '"절대로 포기하지 않아!" — 아스타',
    '도쿄 리벤저스':       '"내가 지켜낼 거야." — 하나가키 타케미치',
    '북두신권':            '"너는 이미 죽어있다." — 켄시로',
    '데스노트':            '"나는 정의다." — 야가미 라이토',
    '베르세르크':          '"꿈이란 건 자신이 그 안에서 어떻게 살아가느냐에 달려있어." — 가츠',
    '몬스터':              '"괴물을 만들어낸 건 나 자신이다." — 덴마 켄조',
    '20세기 소년':         '"친구..." — 케지',
    '배가본드':            '"검을 잡은 이유를 잊지 마라." — 미야모토 무사시',
    '기생수':              '"나는 지금 제대로 살아있는 거야." — 이즈미 신이치',
    '빈란드 사가':         '"진정한 전사에겐 적이 없다." — 토르피안',
    '도쿄구울':            '"이 세계엔 선인도 악인도 없어. 단지 약자가 있을 뿐이야." — 카네키 켄',
    '나나':                '"사랑이란 같은 방향을 함께 바라보는 거야." — 오사키 나나',
    '핑퐁':                '"히어로가 나타날 시간이야." — 스마일',
    '소용돌이':            '"소용돌이에서 벗어날 수 없어." — 키리에',
    '이야기 시리즈':       '"나는 너를 구하고 싶어. 하지만 그건 나를 위해서이기도 해." — 아라라기 코야미',
    '요르문간드':          '"평화를 원하는가? 전쟁을 준비하라." — 코코 헤크마티아르',
    '플루토':              '"감정을 얻었을 때, 나는 처음으로 인간을 이해했다." — 게지히트',
    '후지모토 단편':       '"선택이 인생을 만든다."',
    '아이의 시간':         '"어른이 된다는 건, 무언가를 잃는 거야."',
  },
  en: {
    '원피스':              '"I\'m gonna be King of the Pirates!" — Monkey D. Luffy',
    '나루토':              '"Not giving up — that\'s my ninja way." — Naruto Uzumaki',
    '블리치':              '"I get stronger because I have something to protect." — Ichigo Kurosaki',
    '진격의 거인':         '"Fight. If you want to survive in this world, keep fighting." — Eren Yeager',
    '드래곤볼':            '"Fighting strong opponents is what I love most." — Goku',
    '강철의 연금술사':     '"Equivalent Exchange — the foundation of alchemy." — Edward Elric',
    '헌터×헌터':           '"If you set your own limits, those become your real limits." — Killua Zoldyck',
    '귀멸의 칼날':         '"I won\'t lose. Never." — Tanjiro Kamado',
    '주술회전':            '"I fight for the right deaths." — Yuji Itadori',
    '슬램덩크':            '"The left hand is just there for support." — Mitsui Hisashi',
    '하이큐':              '"Even now, somewhere out there, someone is bouncing a ball." — Hinata Shoyo',
    '체인소맨':            '"Kill devils and you can have anything." — Denji',
    '단다단':              '"Thanks for believing in me." — Okarun',
    '원펀맨':              '"Being a hero is just a hobby." — Saitama',
    '괴수8호':             '"I will join the Defense Force no matter what." — Kafka Hibino',
    '블루록':              '"Call yourself the world\'s greatest egoist." — Isagi',
    '나의 히어로 아카데미아': '"Because you said I could." — Izuku Midoriya',
    '페어리테일':          '"Friends are stronger than magic." — Natsu Dragneel',
    '블랙 클로버':         '"I will never give up!" — Asta',
    '도쿄 리벤저스':       '"I\'ll protect you." — Takemichi Hanagaki',
    '북두신권':            '"You are already dead." — Kenshiro',
    '데스노트':            '"I am justice." — Light Yagami',
    '베르세르크':          '"A dream is how you choose to live inside it." — Guts',
    '몬스터':              '"I created the monster myself." — Kenzo Tenma',
    '20세기 소년':         '"Friend..." — Kenji',
    '배가본드':            '"Never forget why you first held a sword." — Musashi Miyamoto',
    '기생수':              '"I am truly alive right now." — Shinichi Izumi',
    '빈란드 사가':         '"A true warrior has no enemies." — Thorfinn',
    '도쿄구울':            '"There are no good or evil people. Only the weak." — Ken Kaneki',
    '나나':                '"Love isn\'t looking at each other — it\'s looking in the same direction." — Nana Osaki',
    '핑퐁':                '"It\'s time for the hero to show up." — Smile',
    '소용돌이':            '"There is no escaping the spiral." — Kirie',
    '이야기 시리즈':       '"I want to save you — but it\'s also for my own sake." — Koyomi Araragi',
    '요르문간드':          '"If you want peace, prepare for war." — Koko Hekmatyar',
    '플루토':              '"When I gained emotions, I finally understood humans." — Gesicht',
    '후지모토 단편':       '"Choices make a life."',
    '아이의 시간':         '"Growing up means losing something."',
  },
};

// ══════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = arr => [...arr].sort(() => Math.random() - .5);

// 한국어 조사 자동 선택
function getJosa(word, type) {
  if (!word) return type === '이/가' ? '이' : type === '을/를' ? '을' : '은';
  const code = word[word.length - 1].charCodeAt(0);
  const isKorean = code >= 0xAC00 && code <= 0xD7A3;
  const hasBatchim = isKorean && (code - 0xAC00) % 28 !== 0;
  if (type === '이/가') return hasBatchim ? '이' : '가';
  if (type === '을/를') return hasBatchim ? '을' : '를';
  if (type === '은/는') return hasBatchim ? '은' : '는';
  return '';
}

function getQuote(work, isEn) {
  return (isEn ? WORK_QUOTES.en : WORK_QUOTES.ko)[work.title_ko] || '';
}

function getRoundLabel(round) {
  return (getLang() === 'ko' ? ROUND_NAMES.ko : ROUND_NAMES.en)[round] || `${round}강`;
}

// ══════════════════════════════════════════
// 상태
// ══════════════════════════════════════════

const state = {
  category:     null,
  works:        [],
  roundMatches: [],
  currentMatch: 0,
  winners:      [],
  round:        16,
  totalMatches: 15,   // 16강:8 + 8강:4 + 4강:2 + 결승:1
  matchPlayed:  0,
  sessionKey:   genUUID(),
  top4:         [],
  resultWinner: null,
  history:      [],   // { round, winner, loser }
  selecting:    false,
};

// ══════════════════════════════════════════
// 화면 전환
// ══════════════════════════════════════════

function showSection(id) {
  ['wc-category', 'wc-arena', 'wc-result'].forEach(s => {
    $(s).style.display = s === id ? '' : 'none';
  });
}

// ══════════════════════════════════════════
// Supabase 로드
// ══════════════════════════════════════════

async function loadWorks(category) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/worldcup_works?category=eq.${category}&is_active=eq.true&select=*`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  if (!res.ok) throw new Error('Failed to load works');
  return res.json();
}

// ══════════════════════════════════════════
// 작품 선발 & 브라켓
// ══════════════════════════════════════════

function selectWorks(works) {
  const byTier = tier => shuffle(works.filter(w => w.popularity_tier === tier));
  const S = byTier('S'), A = byTier('A'), B = byTier('B');
  const sCount = S.length;
  const remain = 16 - sCount;
  const aCount = Math.min(A.length, Math.ceil(remain / 2));
  const bCount = Math.min(B.length, remain - aCount);
  return shuffle([...S.slice(0, sCount), ...A.slice(0, aCount), ...B.slice(0, bCount)]).slice(0, 16);
}

function buildBracket(works) {
  const S    = works.filter(w => w.popularity_tier === 'S');
  const rest = works.filter(w => w.popularity_tier !== 'S');
  const shuffledS    = shuffle(S);
  const pool         = shuffle(rest);
  const pairs        = [];
  const usedS        = new Set();

  for (let i = 0; i < 8; i++) {
    if (shuffledS[i] && !usedS.has(shuffledS[i].id)) {
      const opp = pool.shift();
      if (opp) { pairs.push([shuffledS[i], opp]); usedS.add(shuffledS[i].id); }
    }
  }

  const remaining = shuffle(works.filter(w => !pairs.flat().some(p => p.id === w.id)));
  for (let i = 0; i < remaining.length; i += 2) {
    if (remaining[i + 1]) pairs.push([remaining[i], remaining[i + 1]]);
  }

  return shuffle(pairs);
}

// ══════════════════════════════════════════
// 커버 이미지
// ══════════════════════════════════════════

function randomBg() {
  return `url(/kin/k2/assets/bg/bg${Math.floor(Math.random() * 10) + 1}.png)`;
}

async function loadCover(work, bgEl) {
  if (!work.mal_id) { bgEl.style.backgroundImage = randomBg(); return; }
  const url = await fetchAniListCover(work.mal_id).catch(() => null);
  bgEl.style.backgroundImage = url ? `url(${url})` : randomBg();
}

async function loadCoverAnimated(work, bgEl, imgWrap) {
  const url = work.mal_id ? await fetchAniListCover(work.mal_id).catch(() => null) : null;
  bgEl.style.backgroundImage = url ? `url(${url})` : randomBg();
  await sleep(80);
  imgWrap?.classList.add('img-loaded');
}

// ══════════════════════════════════════════
// KIN 배너
// ══════════════════════════════════════════

function showKinBanner(text, mood = 'serious') {
  const banner = $('wc-kin-banner');
  $('wc-banner-avatar').src = KIN_IMGS[mood] || KIN_IMGS.serious;
  $('wc-banner-text').textContent = text;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4000);
}

// ══════════════════════════════════════════
// 매치 렌더
// ══════════════════════════════════════════

async function renderMatch() {
  const [workA, workB] = state.roundMatches[state.currentMatch];
  const isEn = getLang() === 'en';

  // 텍스트
  $('wc-title-a').textContent = isEn ? workA.title_en : workA.title_ko;
  $('wc-hook-a').textContent  = isEn ? workA.hook_en  : workA.hook_ko;
  $('wc-title-b').textContent = isEn ? workB.title_en : workB.title_ko;
  $('wc-hook-b').textContent  = isEn ? workB.hook_en  : workB.hook_ko;

  // 헤더
  $('wc-round-label').textContent    = getRoundLabel(state.round);
  $('wc-progress-text').textContent  = `${state.matchPlayed + 1} / ${state.totalMatches}`;

  // 이미지 초기화
  const bgA   = $('wc-bg-a'),    bgB   = $('wc-bg-b');
  const imgA  = bgA?.closest('.wc-work-img');
  const imgB  = bgB?.closest('.wc-work-img');
  if (bgA) bgA.style.backgroundImage = '';
  if (bgB) bgB.style.backgroundImage = '';
  imgA?.classList.remove('img-loaded');
  imgB?.classList.remove('img-loaded');

  // 카드/VS 리셋
  const wa = $('wc-work-a'), wb = $('wc-work-b'), vs = $('wc-vs');
  ['entered','wc-selected','wc-loser','wc-exit-left','wc-exit-right'].forEach(c => {
    wa.classList.remove(c); wb.classList.remove(c);
  });
  vs.classList.remove('entered');
  wa.style.pointerEvents = '';
  wb.style.pointerEvents = '';

  // 결승 직전 KIN 배너
  if (state.round === 2) {
    showKinBanner(isEn ? "Here's where your real taste shows." : "여기서 진짜 취향이 갈려.", 'serious');
  }

  // 입장 애니메이션
  await sleep(40);
  wa.classList.add('entered');
  await sleep(100);
  wb.classList.add('entered');
  await sleep(150);
  vs.classList.add('entered');

  // 이미지 비동기 로드
  loadCoverAnimated(workA, bgA, imgA);
  loadCoverAnimated(workB, bgB, imgB);
}

// ══════════════════════════════════════════
// 선택 처리
// ══════════════════════════════════════════

async function selectWork(winnerWork, loserWork) {
  if (state.selecting) return;
  state.selecting = true;

  const [pairA] = state.roundMatches[state.currentMatch];
  const winnerEl = winnerWork === pairA ? $('wc-work-a') : $('wc-work-b');
  const loserEl  = winnerWork === pairA ? $('wc-work-b') : $('wc-work-a');

  $('wc-work-a').style.pointerEvents = 'none';
  $('wc-work-b').style.pointerEvents = 'none';

  winnerEl.classList.add('wc-selected');
  loserEl.classList.add('wc-loser');
  await sleep(650);

  $('wc-work-a').classList.add('wc-exit-left');
  $('wc-work-b').classList.add('wc-exit-right');
  $('wc-vs').classList.remove('entered');
  await sleep(380);

  state.history.push({ round: state.round, winner: winnerWork, loser: loserWork });
  if (state.round === 4) state.top4.push(loserWork);

  state.winners.push(winnerWork);
  state.currentMatch++;
  state.matchPlayed++;
  state.selecting = false;

  if (state.currentMatch < state.roundMatches.length) {
    await renderMatch();
  } else if (state.winners.length === 1) {
    // 결승 종료
    state.top4 = [state.winners[0], loserWork, ...state.top4];
    state.resultWinner = state.winners[0];
    await showResult(state.winners[0]);
  } else {
    // 다음 라운드
    state.round        = state.round / 2;
    state.roundMatches = [];
    for (let i = 0; i < state.winners.length; i += 2) {
      if (state.winners[i + 1]) state.roundMatches.push([state.winners[i], state.winners[i + 1]]);
    }
    state.winners      = [];
    state.currentMatch = 0;
    await renderMatch();
  }
}

// ══════════════════════════════════════════
// 결과 화면
// ══════════════════════════════════════════

const resultCoverCache = new Map();

async function loadCoverCached(work, bgEl) {
  if (!work.mal_id) { bgEl.style.backgroundImage = randomBg(); return; }
  if (resultCoverCache.has(work.mal_id)) {
    bgEl.style.backgroundImage = `url(${resultCoverCache.get(work.mal_id)})`;
    return;
  }
  const url = await fetchAniListCover(work.mal_id).catch(() => null);
  const val = url ? `url(${url})` : randomBg();
  bgEl.style.backgroundImage = val;
  if (url) resultCoverCache.set(work.mal_id, url);
}

function getWcObs(winner, isEn) {
  const tier  = winner.popularity_tier;
  const title = winner.title_ko;
  if (isEn) {
    const en = winner.title_en;
    if (tier === 'S') return `You went with the classic. ${en} as your winner says you trust what's already been proven.`;
    if (tier === 'A') return `Interesting. You passed on the obvious choices and landed on ${en}. That's a real preference, not just familiarity.`;
    return `${en} winning this says something. You're not picking by reputation. You're picking by feel.`;
  }
  const ga  = getJosa(title, '이/가');
  const eul = getJosa(title, '을/를');
  if (tier === 'S') return `${title}${eul} 골랐구나. 검증된 걸 고른 거야. 근데 그게 네 취향이랑 딱 맞는다는 거잖아.`;
  if (tier === 'A') return `${title}까지 올라올 줄은 몰랐어. 유명한 것보다 네 결에 맞는 걸 고른 거야.`;
  return `${title}${ga} 우승이라니. 인지도랑 상관없이 뭔가 다른 기준으로 고른 거야. 그 기준이 뭔지 나도 궁금하다.`;
}

function renderResultContent(isEn) {
  const winner = state.resultWinner;
  if (!winner) return;
  const second = state.top4[1];

  $('wc-result-eyebrow').textContent = isEn ? 'Your Pick'  : '네가 선택한 우승작';
  $('wc-result-title').textContent   = isEn ? winner.title_en : winner.title_ko;

  loadCoverCached(winner, $('wc-winner-bg'));
  $('wc-winner-hook').textContent  = isEn ? winner.hook_en  : winner.hook_ko;
  $('wc-winner-quote').textContent = getQuote(winner, isEn);

  if (second) {
    $('wc-second-label').textContent = isEn ? '🥈 Runner-up' : '🥈 준우승';
    $('wc-second-title').textContent = isEn ? second.title_en : second.title_ko;
    $('wc-second-hook').textContent  = isEn ? second.hook_en  : second.hook_ko;
    $('wc-second-quote').textContent = getQuote(second, isEn);
    loadCoverCached(second, $('wc-second-bg'));
    $('wc-second-card').style.display = '';
  }

  $('wc-obs-text').textContent = getWcObs(winner, isEn);
  $('wc-obs-avatar').src       = KIN_IMGS.happy;

  $('wc-btn-retry').textContent   = isEn ? 'Try Again'  : '다시 하기';
  $('wc-btn-share').textContent   = isEn ? 'Share Card' : '카드 공유';
  $('wc-btn-bracket').textContent = isEn ? 'Bracket'    : '대진표';
}

async function showResult(winner) {
  showSection('wc-result');
  state.resultWinner = winner;
  renderResultContent(getLang() === 'en');

  // KIN 에이전트 이벤트 (fire-and-forget)
  fetch(`${API_URL}/api/kin/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'k2_manga',
      event_type: 'worldcup_completed',
      payload: {
        category:    state.category,
        winner:      winner.title_ko,
        top4:        state.top4.slice(0, 4).map(w => w.title_ko),
        winner_tier: winner.popularity_tier,
        lang:        getLang(),
      },
    }),
  }).catch(() => {});

  // Supabase 세션 저장 (fire-and-forget)
  fetch(`${SUPA_URL}/rest/v1/worldcup_sessions`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      session_key: state.sessionKey,
      category:    state.category,
      winner:      winner.title_ko,
      top4:        state.top4.slice(0, 4).map(w => w.title_ko),
      winner_tier: winner.popularity_tier,
      lang:        getLang(),
    }),
  }).catch(() => {});
}

// ══════════════════════════════════════════
// 공유 카드
// ══════════════════════════════════════════

let shareBlob = null, shareBlobUrl = null;

async function generateResultShareImage() {
  if (!window.html2canvas) throw new Error('no html2canvas');
  const winner = state.resultWinner;
  const isEn   = getLang() === 'en';

  $('sc-main-eyebrow').textContent = isEn ? 'My Pick · KIN Worldcup' : '내 픽 · KIN 월드컵';
  $('sc-main-title').textContent   = isEn ? winner.title_en : winner.title_ko;
  $('sc-main-obs').textContent     = getWcObs(winner, isEn);

  const bgEl = $('sc-main-bg');
  if (winner.mal_id) {
    const url = await fetchAniListCover(winner.mal_id).catch(() => null);
    if (url) {
      bgEl.style.backgroundImage = `url(${url})`;
      await new Promise(r => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = r; img.onerror = r;
        img.src = url;
      });
    }
  }

  const canvas = await html2canvas($('sc-main'), { backgroundColor: '#080806', scale: 2, useCORS: true, logging: false });
  return new Promise(r => canvas.toBlob(r, 'image/png'));
}

async function generateBracketShareImage() {
  if (!window.html2canvas) throw new Error('no html2canvas');
  const winner = state.resultWinner;
  const isEn   = getLang() === 'en';

  // 우승자 경로 (결승→4강→8강→16강 순)
  const path = state.history
    .filter(h => h.winner.id === winner.id)
    .sort((a, b) => a.round - b.round);

  const rNames = { ko: { 2:'결승', 4:'4강', 8:'8강', 16:'16강' }, en: { 2:'Final', 4:'Semi', 8:'Quarter', 16:'Round of 16' } };
  const dict   = isEn ? rNames.en : rNames.ko;

  const makeCircle = async (work, size) => {
    const url  = work?.mal_id ? await fetchAniListCover(work.mal_id).catch(() => null) : null;
    const name = isEn ? work?.title_en : work?.title_ko;
    const big  = size >= 72;
    return `<div style="text-align:center;flex-shrink:0;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;margin:0 auto 5px;border:${big ? '2.5' : '1.5'}px solid rgba(255,229,0,${big ? '.8' : '.4'});">
        ${url ? `<img crossorigin="anonymous" src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="">` : `<div style="width:100%;height:100%;background:#1a1a14;"></div>`}
      </div>
      <div style="color:${big ? '#FFE500' : 'rgba(255,255,255,.8)'};font-size:${big ? 12 : 10}px;font-weight:700;max-width:${size + 16}px;word-break:keep-all;">${name || ''}</div>
    </div>`;
  };

  let rows = '';
  for (const match of path) {
    const rLabel  = dict[match.round] || match.round;
    const wName   = isEn ? match.winner.title_en : match.winner.title_ko;
    const lName   = isEn ? match.loser.title_en  : match.loser.title_ko;
    const showImg = match.round <= 4;

    if (showImg) {
      const size    = match.round === 2 ? 80 : 56;
      const wCircle = await makeCircle(match.winner, size);
      const lCircle = await makeCircle(match.loser,  size - 16);
      rows += `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);">
        <div style="font-size:8px;letter-spacing:.15em;color:rgba(255,229,0,.45);width:36px;flex-shrink:0;">${rLabel}</div>
        <div style="display:flex;align-items:center;gap:10px;">${wCircle}<div style="font-size:9px;color:rgba(255,255,255,.2);">vs</div><div style="opacity:.4;">${lCircle}</div></div>
      </div>`;
    } else {
      rows += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <div style="font-size:8px;letter-spacing:.15em;color:rgba(255,229,0,.35);width:36px;flex-shrink:0;">${rLabel}</div>
        <div style="font-size:11px;color:rgba(255,229,0,.75);font-weight:700;">${wName}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.18);">vs</div>
        <div style="font-size:10px;color:rgba(255,255,255,.25);text-decoration:line-through;">${lName}</div>
      </div>`;
    }
  }

  $('sc-bracket-eyebrow').textContent = isEn ? 'My Bracket · KIN Worldcup' : '대진표 · KIN 월드컵';
  $('sc-bracket-content').innerHTML   = rows;

  const imgs = $('sc-bracket').querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img =>
    new Promise(r => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } })
  ));

  const canvas = await html2canvas($('sc-bracket'), { backgroundColor: '#080806', scale: 2, useCORS: true, logging: false });
  return new Promise(r => canvas.toBlob(r, 'image/png'));
}

async function openShareModal(generateFn) {
  const modal   = $('wc-share-modal');
  const loading = $('wc-share-loading');
  const imgEl   = $('wc-share-img');
  const btns    = $('wc-share-btns');

  modal.classList.add('open');
  loading.style.display = 'block';
  imgEl.style.display   = 'none';
  btns.style.display    = 'none';

  try {
    shareBlob = await generateFn();
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl    = URL.createObjectURL(shareBlob);
    imgEl.src       = shareBlobUrl;
    imgEl.style.display = 'block';
    btns.style.display  = 'flex';
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
  $('h-title').textContent = isEn ? 'Work Worldcup' : '작품 월드컵';

  $('wc-intro-line').innerHTML = isEn
    ? "This isn't about picking the best manga.<br>It's about finding out where your taste actually lands."
    : "이건 최고의 만화를 뽑는 게임이 아니야.<br>네 취향이 어디로 기우는지 보는 월드컵이야.";
  $('wc-intro-sub').innerHTML = isEn
    ? "Pick a category and the 16-team tournament begins.<br>In each matchup, choose whichever feels closer to your taste."
    : "카테고리를 선택하면 16강 토너먼트가 시작돼.<br>1:1 대결에서 네 취향에 더 가까운 쪽을 골라.";
  $('cat-battle-title').textContent   = isEn ? 'Battle & Growth'                  : '소년 배틀·성장';
  $('cat-battle-sub').textContent     = isEn ? 'Action, rivalry, and the will to grow' : '성장, 전투, 우정이 강한 작품들';
  $('cat-thriller-title').textContent = isEn ? 'Psychological Drama'              : '심리·드라마';
  $('cat-thriller-sub').textContent   = isEn ? 'Dark, tense, and hard to shake off'   : '압박감과 해석 욕구가 남는 작품들';

  // 대진 중이면 갱신 (selecting 중 스킵)
  if (!state.selecting && state.roundMatches.length > 0 && state.currentMatch < state.roundMatches.length) {
    renderMatch();
  }

  // 결과 화면 lang 전환
  if (state.resultWinner) renderResultContent(isEn);
}

// ══════════════════════════════════════════
// 이벤트 리스너
// ══════════════════════════════════════════

// 카테고리 선택
document.querySelectorAll('.wc-cat-card').forEach(card => {
  card.addEventListener('click', async () => {
    state.category = card.dataset.category;
    showSection('wc-arena');

    try {
      const works = await loadWorks(state.category);
      state.works = selectWorks(works);
      if (state.works.length < 16) throw new Error('not enough works');

      const pairs = buildBracket(state.works);
      Object.assign(state, {
        roundMatches: pairs,
        totalMatches: 15,
        round: 16, currentMatch: 0,
        winners: [], matchPlayed: 0,
        top4: [], history: [], selecting: false,
      });

      const isEn = getLang() === 'en';
      showKinBanner(
        isEn ? "Not a ranking. Not a poll. Just your taste."
             : "이건 최고의 만화를 고르는 게 아니야. 네 취향을 고르는 거야.",
        'thinking'
      );

      await renderMatch();
    } catch {
      showError(t('작품을 불러오지 못했어.', 'Could not load works.'));
      showSection('wc-category');
    }
  });
});

// 카드 클릭
$('wc-work-a').addEventListener('click', () => {
  if (!state.roundMatches[state.currentMatch]) return;
  const [workA, workB] = state.roundMatches[state.currentMatch];
  selectWork(workA, workB);
});
$('wc-work-b').addEventListener('click', () => {
  if (!state.roundMatches[state.currentMatch]) return;
  const [workA, workB] = state.roundMatches[state.currentMatch];
  selectWork(workB, workA);
});

// 모바일 스와이프 (위=A선택, 아래=B선택)
let touchStartY = 0, touchStartX = 0;
document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (state.selecting || !state.roundMatches[state.currentMatch]) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dy) < 55 || Math.abs(dx) > Math.abs(dy)) return;
  const [workA, workB] = state.roundMatches[state.currentMatch];
  if (dy < 0) selectWork(workA, workB);
  else        selectWork(workB, workA);
}, { passive: true });

// 공유 버튼
$('wc-btn-share').addEventListener('click',   () => openShareModal(generateResultShareImage));
$('wc-btn-bracket').addEventListener('click', () => openShareModal(generateBracketShareImage));

$('wc-share-modal-close').addEventListener('click', () => $('wc-share-modal').classList.remove('open'));
$('wc-share-modal').addEventListener('click', e => {
  if (e.target === $('wc-share-modal')) $('wc-share-modal').classList.remove('open');
});

$('wc-btn-share-save').addEventListener('click', async () => {
  if (!shareBlob) return;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    try {
      const file = new File([shareBlob], 'kin-worldcup.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: getLang() === 'en' ? 'KIN Worldcup' : 'KIN 월드컵' });
    } catch { window.open(shareBlobUrl, '_blank'); }
  } else {
    const a = document.createElement('a');
    a.href = shareBlobUrl; a.download = 'kin-worldcup.png'; a.click();
  }
});

$('wc-btn-share-native').addEventListener('click', async () => {
  if (!shareBlob) return;
  const file = new File([shareBlob], 'kin-worldcup.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'KIN 월드컵', text: 'kinxdred.com/kin/k2' });
    } else {
      await navigator.share({ title: 'KIN 월드컵', url: 'https://kinxdred.com/kin/k2' });
    }
  } catch {}
});

// 다시 하기
$('wc-btn-retry').addEventListener('click', () => {
  Object.assign(state, {
    category: null, works: [], roundMatches: [], winners: [],
    top4: [], round: 16, currentMatch: 0, matchPlayed: 0,
    resultWinner: null, history: [], selecting: false,
    sessionKey: genUUID(),
  });
  resultCoverCache.clear();
  showSection('wc-category');
});

// ══════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════

initLangToggle(applyLang);

(async () => {
  $('wc-loading').style.display = 'none';
  showSection('wc-category');
  applyLang(getLang());
})();
