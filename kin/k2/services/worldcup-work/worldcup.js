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

// ── 명대사 ──
const WORK_QUOTES = {
  ko: {
    '원피스':           '"나는 왕이 될 거야!" — 몽키 D. 루피',
    '나루토':           '"포기하지 않는 것, 그게 나의 닌도야." — 우즈마키 나루토',
    '블리치':           '"지키고 싶은 게 있어서 강해지는 거야." — 쿠로사키 이치고',
    '진격의 거인':      '"싸워라. 이 세계에서 살아남고 싶다면." — 에렌 예거',
    '드래곤볼':         '"강한 놈이랑 싸우는 게 제일 좋아." — 손오공',
    '강철의 연금술사':  '"등가교환. 그것이 연금술의 기본 법칙이다." — 에드워드 엘릭',
    '헌터×헌터':        '"한계를 정해 두면 그게 진짜 한계가 된다." — 킬루아 조르딕',
    '귀멸의 칼날':      '"지지 않을 거야. 절대로." — 카마도 탄지로',
    '주술회전':         '"올바른 죽음을 위해 나는 싸운다." — 이타도리 유지',
    '슬램덩크':         '"왼손은 거들 뿐." — 미츠이 히사시',
    '하이큐':           '"지금 이 순간도, 어딘가에서 공은 튀기고 있다." — 히나타 쇼요',
    '체인소맨':         '"악마를 잡으면 뭐든 살 수 있어." — 덴지',
    '단다단':           '"믿어줘서 고마워." — 오카론',
    '원펀맨':           '"영웅 활동은 취미야." — 사이타마',
    '괴수8호':          '"나는 반드시 방위대에 들어간다." — 카프카 히비노',
    '블루록':           '"자신을 세계 최강의 이기주의자라고 불러라." — 이기',
    '나의 히어로 아카데미아': '"네가 할 수 있다고 말해줬으니까." — 미도리야 이즈쿠',
    '페어리테일':       '"동료는 마법보다 강하다." — 나츠 드래그닐',
    '블랙 클로버':      '"절대로 포기하지 않아!" — 아스타',
    '도쿄 리벤저스':    '"내가 지켜낼 거야." — 하나가키 타케미치',
    '북두신권':         '"너는 이미 죽어있다." — 켄시로',
    '데스노트':         '"나는 정의다." — 야가미 라이토',
    '베르세르크':       '"꿈이란 건 자신이 그 안에서 어떻게 살아가느냐에 달려있어." — 가츠',
    '몬스터':           '"괴물을 만들어낸 건 나 자신이다." — 덴마 켄조',
    '20세기 소년':      '"친구..." — 케지',
    '배가본드':         '"검을 잡은 이유를 잊지 마라." — 미야모토 무사시',
    '기생수':           '"나는 지금 제대로 살아있는 거야." — 이즈미 신이치',
    '빈란드 사가':      '"진정한 전사에겐 적이 없다." — 토르피안',
    '도쿄구울':         '"이 세계엔 선인도 악인도 없어. 단지 약자가 있을 뿐이야." — 카네키 켄',
    '나나':             '"사랑이란 같은 방향을 함께 바라보는 거야." — 오사키 나나',
    '핑퐁':             '"히어로가 나타날 시간이야." — 스마일',
    '소용돌이':         '"소용돌이에서 벗어날 수 없어." — 키리에',
    '이야기 시리즈':    '"나는 너를 구하고 싶어. 하지만 그건 나를 위해서이기도 해." — 아라라기 코야미',
    '요르문간드':       '"평화를 원하는가? 전쟁을 준비하라." — 코코 헤크마티아르',
    '플루토':           '"감정을 얻었을 때, 나는 처음으로 인간을 이해했다." — 게지히트',
    '후지모토 단편':    '"선택이 인생을 만든다."',
    '아이의 시간':      '"어른이 된다는 건, 무언가를 잃는 거야."',
  },
  en: {
    '원피스':           '"I\'m gonna be King of the Pirates!" — Monkey D. Luffy',
    '나루토':           '"Not giving up — that\'s my ninja way." — Naruto Uzumaki',
    '블리치':           '"I get stronger because I have something to protect." — Ichigo Kurosaki',
    '진격의 거인':      '"Fight. If you want to survive in this world, keep fighting." — Eren Yeager',
    '드래곤볼':         '"Fighting strong opponents is what I love most." — Goku',
    '강철의 연금술사':  '"Equivalent Exchange — the foundation of alchemy." — Edward Elric',
    '헌터×헌터':        '"If you set your own limits, those become your real limits." — Killua Zoldyck',
    '귀멸의 칼날':      '"I won\'t lose. Never." — Tanjiro Kamado',
    '주술회전':         '"I fight for the right deaths." — Yuji Itadori',
    '슬램덩크':         '"The left hand is just there for support." — Mitsui Hisashi',
    '하이큐':           '"Even now, somewhere out there, someone is bouncing a ball." — Hinata Shoyo',
    '체인소맨':         '"Kill devils and you can have anything." — Denji',
    '단다단':           '"Thanks for believing in me." — Okarun',
    '원펀맨':           '"Being a hero is just a hobby." — Saitama',
    '괴수8호':          '"I will join the Defense Force no matter what." — Kafka Hibino',
    '블루록':           '"Call yourself the world\'s greatest egoist." — Isagi',
    '나의 히어로 아카데미아': '"Because you said I could." — Izuku Midoriya',
    '페어리테일':       '"Friends are stronger than magic." — Natsu Dragneel',
    '블랙 클로버':      '"I will never give up!" — Asta',
    '도쿄 리벤저스':    '"I\'ll protect you." — Takemichi Hanagaki',
    '북두신권':         '"You are already dead." — Kenshiro',
    '데스노트':         '"I am justice." — Light Yagami',
    '베르세르크':       '"A dream is how you choose to live inside it." — Guts',
    '몬스터':           '"I created the monster myself." — Kenzo Tenma',
    '20세기 소년':      '"Friend..." — Kenji',
    '배가본드':         '"Never forget why you first held a sword." — Musashi Miyamoto',
    '기생수':           '"I am truly alive right now." — Shinichi Izumi',
    '빈란드 사가':      '"A true warrior has no enemies." — Thorfinn',
    '도쿄구울':         '"There are no good or evil people. Only the weak." — Ken Kaneki',
    '나나':             '"Love isn\'t looking at each other — it\'s looking in the same direction." — Nana Osaki',
    '핑퐁':             '"It\'s time for the hero to show up." — Smile',
    '소용돌이':         '"There is no escaping the spiral." — Kirie',
    '이야기 시리즈':    '"I want to save you — but it\'s also for my own sake." — Koyomi Araragi',
    '요르문간드':       '"If you want peace, prepare for war." — Koko Hekmatyar',
    '플루토':           '"When I gained emotions, I finally understood humans." — Gesicht',
    '후지모토 단편':    '"Choices make a life."',
    '아이의 시간':      '"Growing up means losing something."',
  },
};

function getQuote(work, isEn) {
  const dict = isEn ? WORK_QUOTES.en : WORK_QUOTES.ko;
  return dict[work.title_ko] || '';
}

// ── DOM ──
const $ = id => document.getElementById(id);

// ── 유틸 ──
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = arr => [...arr].sort(() => Math.random() - .5);

// ── 상태 ──
const state = {
  category: null,
  works: [],
  roundMatches: [],
  currentMatch: 0,
  winners: [],
  round: 16,
  totalMatches: 15,   // 16강:8 + 8강:4 + 4강:2 + 결승:1 = 15
  matchPlayed: 0,
  sessionKey: genUUID(),
  top4: [],
  resultWinner: null,
  history: [],        // { round, winner, loser }
  selecting: false,   // 클릭/스와이프 중 중복 방지
};

// ── 라운드명 (공통) ──
const ROUND_NAMES = {
  ko: { 16:'16강', 8:'8강', 4:'4강', 2:'결승' },
  en: { 16:'Round of 16', 8:'Quarter-final', 4:'Semi-final', 2:'Final' },
};

// ── lang 초기화 ──
initLangToggle(applyLang);

// ── Supabase 작품 로드 ──
async function loadWorks(category) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/worldcup_works?category=eq.${category}&is_active=eq.true&select=*`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  if (!res.ok) throw new Error('Failed to load works');
  return res.json();
}

// ── tier 기반 16개 추출 ──
// battle: S4 A8 B9 → S4 + A6 + B6 = 16
// thriller: S3 A6 B7 → S3 + A6 + B7 but cap at 16
function selectWorks(works) {
  const byTier = t => shuffle(works.filter(w => w.popularity_tier === t));
  const S = byTier('S'), A = byTier('A'), B = byTier('B');

  // S 전부 포함, A/B에서 나머지 채우기
  const sCount = S.length;           // 최대 4 (battle) or 3 (thriller)
  const remain = 16 - sCount;
  const aCount = Math.min(A.length, Math.ceil(remain / 2));
  const bCount = Math.min(B.length, remain - aCount);

  return shuffle([
    ...S.slice(0, sCount),
    ...A.slice(0, aCount),
    ...B.slice(0, bCount),
  ]).slice(0, 16);
}

// ── 브라켓 생성 (tier 기반 시드 보정) ──
// S급끼리 8강 이전에 안 붙게 배치
function buildBracket(works) {
  const S    = works.filter(w => w.popularity_tier === 'S');
  const rest = works.filter(w => w.popularity_tier !== 'S');

  // 16개를 8쌍으로 — S는 가능하면 서로 다른 쪽 절반에 배치
  const shuffledS = shuffle(S);
  const shuffledRest = shuffle(rest);
  const pool = [...shuffledRest];

  // 8쌍 생성: S가 있으면 non-S와 먼저 매치
  const pairs = [];
  const usedS = new Set();

  for (let i = 0; i < 8; i++) {
    if (shuffledS[i] && !usedS.has(shuffledS[i].id)) {
      const opponent = pool.shift();
      if (opponent) {
        pairs.push([shuffledS[i], opponent]);
        usedS.add(shuffledS[i].id);
      }
    }
  }

  // 남은 것들끼리 매치
  const remaining = works.filter(w =>
    !pairs.flat().some(p => p.id === w.id)
  );
  const shuffledRemaining = shuffle(remaining);
  for (let i = 0; i < shuffledRemaining.length; i += 2) {
    if (shuffledRemaining[i + 1]) {
      pairs.push([shuffledRemaining[i], shuffledRemaining[i + 1]]);
    }
  }

  return shuffle(pairs); // 최종 순서도 셔플
}

// ── 화면 전환 ──
function showSection(id) {
  ['wc-category', 'wc-arena', 'wc-result'].forEach(s => {
    $(s).style.display = s === id ? '' : 'none';
  });
}

// ── 커버 이미지 로드 ──
async function loadCover(work, bgEl) {
  if (!work.mal_id) {
    bgEl.style.backgroundImage = `url(/kin/k2/assets/bg/bg${Math.floor(Math.random()*10)+1}.png)`;
    return;
  }
  const url = await fetchAniListCover(work.mal_id).catch(() => null);
  bgEl.style.backgroundImage = url
    ? `url(${url})`
    : `url(/kin/k2/assets/bg/bg${Math.floor(Math.random()*10)+1}.png)`;
}

// ── 라운드 레이블 ──
function getRoundLabel(round) {
  return (getLang() === 'ko' ? ROUND_NAMES.ko : ROUND_NAMES.en)[round] || `${round}강`;
}

// ── KIN 배너 표시 ──
function showKinBanner(text, mood = 'serious') {
  const banner = $('wc-kin-banner');
  $('wc-banner-avatar').src = KIN_IMGS[mood];
  $('wc-banner-text').textContent = text;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4000);
}

// ── 매치 렌더 ──
async function renderMatch() {
  const [workA, workB] = state.roundMatches[state.currentMatch];
  const isEn = getLang() === 'en';

  // 텍스트 세팅
  $('wc-title-a').textContent = isEn ? workA.title_en : workA.title_ko;
  $('wc-hook-a').textContent  = isEn ? workA.hook_en  : workA.hook_ko;
  $('wc-title-b').textContent = isEn ? workB.title_en : workB.title_ko;
  $('wc-hook-b').textContent  = isEn ? workB.hook_en  : workB.hook_ko;

  // 이미지 초기화
  const bgA = $('wc-bg-a'), bgB = $('wc-bg-b');
  const imgA = bgA?.closest('.wc-work-img');
  const imgB = bgB?.closest('.wc-work-img');
  if (bgA) bgA.style.backgroundImage = '';
  if (bgB) bgB.style.backgroundImage = '';
  imgA?.classList.remove('img-loaded');
  imgB?.classList.remove('img-loaded');

  // 카드/VS 초기 상태로 리셋
  const wa = $('wc-work-a'), wb = $('wc-work-b'), vs = $('wc-vs');
  wa.classList.remove('entered', 'wc-selected', 'wc-loser', 'wc-exit-left', 'wc-exit-right');
  wb.classList.remove('entered', 'wc-selected', 'wc-loser', 'wc-exit-left', 'wc-exit-right');
  vs.classList.remove('entered');
  wa.style.pointerEvents = '';
  wb.style.pointerEvents = '';

  // 라운드 표시
  $('wc-round-label').textContent = getRoundLabel(state.round);
  $('wc-progress-text').textContent = `${state.matchPlayed + 1} / ${state.totalMatches}`;
  updateBracketHover();

  // 결승 직전 KIN 배너
  if (state.round === 2) {
    const text = isEn ? "Here's where your real taste shows." : "여기서 진짜 취향이 갈려.";
    showKinBanner(text, 'serious');
  }

  // 입장 애니메이션 — 쪼는 맛
  await sleep(40); // reflow 보장
  wa.classList.add('entered');
  await sleep(100);
  wb.classList.add('entered');
  await sleep(150);
  vs.classList.add('entered');

  // 이미지 로드 (병렬, 로드 완료 시 밝아짐)
  loadCoverAnimated(workA, bgA, imgA);
  loadCoverAnimated(workB, bgB, imgB);
}

async function loadCoverAnimated(work, bgEl, imgWrap) {
  const url = work.mal_id ? await fetchAniListCover(work.mal_id).catch(() => null) : null;
  bgEl.style.backgroundImage = url
    ? `url(${url})`
    : `url(/kin/k2/assets/bg/bg${Math.floor(Math.random()*10)+1}.png)`;
  await sleep(80);
  imgWrap?.classList.add('img-loaded');
}

// ── 선택 처리 ──
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
  updatePathPanel();
  updateBracketHover();

  if (state.round === 4) state.top4.push(loserWork);

  state.winners.push(winnerWork);
  state.currentMatch++;
  state.matchPlayed++;
  state.selecting = false;

  if (state.currentMatch < state.roundMatches.length) {
    await renderMatch();
  } else {
    if (state.winners.length === 1) {
      state.top4 = [state.winners[0], loserWork, ...state.top4];
      state.resultWinner = state.winners[0];
      await showResult(state.winners[0]);
    } else {
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
}

function updateBracketHover() {
  const panel = $('wc-bracket-hover');
  if (!panel) return;
  const isEn = getLang() === 'en';
  const rNames = isEn ? ROUND_NAMES.en : ROUND_NAMES.ko;
  const rounds = [16, 8, 4, 2];
  const byRound = {};
  rounds.forEach(r => { byRound[r] = state.history.filter(h => h.round === r); });
  const curPair = state.roundMatches[state.currentMatch];

  let html = '';
  rounds.forEach(r => {
    const label = rNames[r];
    const done = byRound[r];
    const totalInRound = r / 2;

    html += `<div class="wc-bracket-round">`;
    html += `<div class="wc-bracket-round-label">${label}</div>`;
    html += `<div class="wc-bracket-matches">`;

    done.forEach(h => {
      const w = isEn ? h.winner.title_en : h.winner.title_ko;
      const l = isEn ? h.loser.title_en  : h.loser.title_ko;
      html += `<div class="wc-bracket-match done"><span class="wc-bm-winner">${w}</span><span class="wc-bm-sep">vs</span><span class="wc-bm-loser">${l}</span></div>`;
    });

    if (curPair && state.round === r && done.length < totalInRound) {
      const a = isEn ? curPair[0].title_en : curPair[0].title_ko;
      const b = isEn ? curPair[1].title_en : curPair[1].title_ko;
      html += `<div class="wc-bracket-match current"><span class="wc-bm-winner">${a}</span><span class="wc-bm-sep">vs</span><span class="wc-bm-winner">${b}</span></div>`;
    }

    const remaining = totalInRound - done.length - (state.round === r ? 1 : 0);
    for (let i = 0; i < Math.max(0, remaining); i++) {
      html += `<div class="wc-bracket-match"><span class="wc-bm-pending">—</span></div>`;
    }

    html += `</div></div>`;
  });

  panel.innerHTML = html;
}
function updatePathPanel() {
  const list = $('wc-path-list');
  if (!list) return;
  const isEn = getLang() === 'en';
  const rNames = isEn ? ROUND_NAMES.en : ROUND_NAMES.ko;
  list.innerHTML = '';
  state.history.forEach(h => {
    const rLabel = rNames[h.round] || h.round;
    const wName  = isEn ? h.winner.title_en : h.winner.title_ko;
    const lName  = isEn ? h.loser.title_en  : h.loser.title_ko;
    const el = document.createElement('div');
    el.className = 'wc-path-item';
    el.innerHTML = `<span class="wc-path-round">${rLabel}</span><span class="wc-path-loser">${lName}</span><span class="wc-path-arrow">→</span><span class="wc-path-winner">${wName}</span><span class="wc-path-check">✓</span>`;
    list.appendChild(el);
  });
}

// ── 브라켓 팝업 업데이트 ──
function updateBracketPopup() {
  const popup = $('wc-bracket-hover');
  if (!popup) return;
  const isEn = getLang() === 'en';
  const rNames = { ko: { 16:'16강', 8:'8강', 4:'4강', 2:'결승' }, en: { 16:'R16', 8:'QF', 4:'SF', 2:'Final' } };
  const rounds = [16, 8, 4, 2];
  let html = '';

  rounds.forEach(r => {
    const done = state.matchResults.filter(m => m.round === r);
    const isCurrent = state.round === r;
    if (done.length === 0 && !isCurrent) return; // 아직 진행 안 한 라운드

    const label = rNames[isEn ? 'en' : 'ko'][r] || r;
    html += `<div class="wc-bracket-round">`;
    html += `<div class="wc-bracket-round-label">${label}</div>`;
    html += `<div class="wc-bracket-matches">`;

    done.forEach(m => {
      const w = isEn ? m.winner.title_en : m.winner.title_ko;
      const l = isEn ? m.loser.title_en  : m.loser.title_ko;
      html += `<div class="wc-bracket-match done"><span class="wc-bm-loser">${l}</span><span class="wc-bm-sep"> › </span><span class="wc-bm-winner">${w}</span></div>`;
    });

    if (isCurrent && state.currentMatch < state.roundMatches.length) {
      const pair = state.roundMatches[state.currentMatch];
      const a = isEn ? pair[0].title_en : pair[0].title_ko;
      const b = isEn ? pair[1].title_en : pair[1].title_ko;
      html += `<div class="wc-bracket-match current"><span class="wc-bm-pending">${a}</span><span class="wc-bm-sep"> vs </span><span class="wc-bm-pending">${b}</span></div>`;
    }

    html += `</div></div>`;
  });

  popup.innerHTML = html;
}

// ── 공유 이미지 생성 ──
let shareBlob = null, shareBlobUrl = null;

async function generateResultShareImage() {
  // 기본 결과 공유카드 (기존 퀴즈와 유사하게 단순화)
  if (!window.html2canvas) throw new Error('no html2canvas');
  const { resultWinner: w } = state;
  const isEn = getLang() === 'en';
  const card = $('sc-bracket');
  const title = isEn ? w.title_en : w.title_ko;
  const obs = getWcObs(w, isEn);
  const coverUrl = w.mal_id ? await fetchAniListCover(w.mal_id).catch(() => null) : null;

  card.innerHTML = `
    <div style="background:#080806;padding:28px 24px;font-family:sans-serif;min-height:300px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid rgba(255,229,0,.12);padding-bottom:14px;">
        <div style="color:#FFE500;font-size:11px;letter-spacing:.15em;">${isEn ? 'MY PICK — KIN WORLDCUP' : '내 픽 — KIN 월드컵'}</div>
        <div style="color:rgba(255,255,255,.25);font-size:10px;">kinxdred.com/kin/k2</div>
      </div>
      ${coverUrl ? `<div style="width:100%;height:180px;border-radius:10px;overflow:hidden;margin-bottom:16px;"><img crossorigin="anonymous" src="${coverUrl}" style="width:100%;height:100%;object-fit:cover;" alt=""></div>` : ''}
      <div style="color:#FFE500;font-size:22px;font-weight:800;margin-bottom:10px;">${title}</div>
      <div style="color:rgba(255,255,255,.65);font-size:12px;line-height:1.7;">${obs}</div>
    </div>`;

  const imgs = card.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img => new Promise(r => {
    if (img.complete) r(); else { img.onload = r; img.onerror = r; }
  })));

  const canvas = await html2canvas(card, { backgroundColor: '#080806', scale: 2, useCORS: true, logging: false });
  return new Promise(r => canvas.toBlob(r, 'image/png'));
}

async function generateBracketShareImage() {
  if (!window.html2canvas) throw new Error('no html2canvas');
  const isEn = getLang() === 'en';
  const card = $('sc-bracket');
  const rLabel = { ko: { 16:'16강', 8:'8강', 4:'4강', 2:'결승' }, en: { 16:'R16', 8:'QF', 4:'SF', 2:'Final' } };

  // 커버 이미지 미리 fetch (캐시됨)
  const getCircle = async (work, size) => {
    const url = work?.mal_id ? await fetchAniListCover(work.mal_id).catch(() => null) : null;
    const name = isEn ? work?.title_en : work?.title_ko;
    return `<div style="text-align:center;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;margin:0 auto 6px;border:${size >= 80 ? '2.5' : '1.5'}px solid rgba(255,229,0,${size >= 80 ? '.7' : '.4'});">
        ${url ? `<img crossorigin="anonymous" src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="">` : `<div style="width:100%;height:100%;background:#1a1a14;"></div>`}
      </div>
      <div style="color:${size >= 80 ? '#FFE500' : 'rgba(255,255,255,.85)'};font-size:${size >= 80 ? 13 : 10}px;font-weight:700;">${name || ''}</div>
    </div>`;
  };

  const final = state.matchResults.find(m => m.round === 2);
  const sf    = state.matchResults.filter(m => m.round === 4);
  const qf    = state.matchResults.filter(m => m.round === 8);
  const r16   = state.matchResults.filter(m => m.round === 16);

  // 결승
  const finalHtml = final ? await getCircle(final.winner, 100) : '';
  // 4강 (winner 원 + loser 취소선)
  const sfCircles = await Promise.all(sf.map(async m => {
    const w = await getCircle(m.winner, 64);
    const lName = isEn ? m.loser.title_en : m.loser.title_ko;
    return `${w}<div style="font-size:9px;color:rgba(255,255,255,.2);text-decoration:line-through;margin-top:2px;">${lName}</div>`;
  }));
  // 8강 텍스트
  const qfHtml = qf.map(m => {
    const w = isEn ? m.winner.title_en : m.winner.title_ko;
    const l = isEn ? m.loser.title_en  : m.loser.title_ko;
    return `<div style="font-size:9px;padding:3px 6px;background:rgba(255,229,0,.05);border:1px solid rgba(255,229,0,.15);border-radius:4px;color:rgba(255,229,0,.8);">${l} <span style="color:rgba(255,255,255,.2)">›</span> ${w}</div>`;
  }).join('');
  // 16강 텍스트
  const r16Html = r16.map(m => {
    const w = isEn ? m.winner.title_en : m.winner.title_ko;
    return `<div style="font-size:8px;padding:2px 5px;border-radius:3px;color:rgba(255,229,0,.5);">${w}</div>`;
  }).join('');

  card.innerHTML = `
    <div style="background:#080806;padding:24px 18px;font-family:sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid rgba(255,229,0,.12);">
        <div style="color:#FFE500;font-size:10px;letter-spacing:.15em;">${isEn ? 'MY BRACKET' : '내 브라켓'}</div>
        <div style="color:rgba(255,255,255,.25);font-size:9px;">kinxdred.com/kin/k2</div>
      </div>

      ${final ? `<div style="font-size:9px;letter-spacing:.12em;color:rgba(255,229,0,.4);text-align:center;margin-bottom:10px;">${rLabel[isEn ? 'en' : 'ko'][2]}</div>
      <div style="display:flex;justify-content:center;margin-bottom:14px;">${finalHtml}</div>
      <div style="text-align:center;color:rgba(255,229,0,.15);font-size:9px;margin-bottom:14px;">────────────────</div>` : ''}

      ${sf.length ? `<div style="font-size:9px;letter-spacing:.12em;color:rgba(255,229,0,.4);text-align:center;margin-bottom:10px;">${rLabel[isEn ? 'en' : 'ko'][4]}</div>
      <div style="display:flex;justify-content:center;gap:24px;margin-bottom:14px;">${sfCircles.join('')}</div>
      <div style="text-align:center;color:rgba(255,229,0,.15);font-size:9px;margin-bottom:14px;">────────────────</div>` : ''}

      ${qf.length ? `<div style="font-size:9px;letter-spacing:.12em;color:rgba(255,229,0,.4);text-align:center;margin-bottom:8px;">${rLabel[isEn ? 'en' : 'ko'][8]}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:14px;">${qfHtml}</div>
      <div style="text-align:center;color:rgba(255,229,0,.15);font-size:9px;margin-bottom:10px;">────────────────</div>` : ''}

      ${r16.length ? `<div style="font-size:9px;letter-spacing:.12em;color:rgba(255,229,0,.4);text-align:center;margin-bottom:8px;">${rLabel[isEn ? 'en' : 'ko'][16]}</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:center;">${r16Html}</div>` : ''}
    </div>`;

  const imgs = card.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img => new Promise(r => {
    if (img.complete) r(); else { img.onload = r; img.onerror = r; }
  })));

  const canvas = await html2canvas(card, { backgroundColor: '#080806', scale: 2, useCORS: true, logging: false });
  return new Promise(r => canvas.toBlob(r, 'image/png'));
}

// ── 공유 모달 공통 ──
async function openShareModal(generateFn) {
  const modal   = $('wc-share-modal');
  const loading = $('wc-share-loading');
  const imgEl   = $('wc-share-img');
  const btns    = $('wc-share-btns');

  modal.classList.add('open');
  loading.style.display = 'block';
  imgEl.style.display = 'none';
  btns.style.display  = 'none';

  try {
    shareBlob = await generateFn();
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl = URL.createObjectURL(shareBlob);
    imgEl.src = shareBlobUrl;
    imgEl.style.display = 'block';
    btns.style.display  = 'flex';
  } catch (e) {
    modal.classList.remove('open');
  } finally {
    loading.style.display = 'none';
  }
}
const resultCoverCache = new Map(); // mal_id → url (결과 lang 전환 시 재요청 방지)

async function loadCoverCached(work, bgEl) {
  if (resultCoverCache.has(work.mal_id)) {
    bgEl.style.backgroundImage = `url(${resultCoverCache.get(work.mal_id)})`;
    return;
  }
  await loadCover(work, bgEl);
  // 세팅된 값을 캐시에 저장
  const set = bgEl.style.backgroundImage.match(/url\("?(.+?)"?\)/)?.[1];
  if (set) resultCoverCache.set(work.mal_id, set);
}

async function showResult(winner) {
  showSection('wc-result');
  const isEn = getLang() === 'en';
  state.resultWinner = winner;

  renderResultContent(isEn);

  // KIN 에이전트 이벤트
  fetch(`${API_URL}/api/kin/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'k2_manga',
      event_type: 'worldcup_completed',
      payload: {
        category: state.category,
        winner: winner.title_ko,
        top4: state.top4.slice(0, 4).map(w => w.title_ko),
        winner_tier: winner.popularity_tier,
        lang: getLang(),
      },
    }),
  }).catch(() => {});

  // Supabase 세션 저장
  fetch(`${SUPA_URL}/rest/v1/worldcup_sessions`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      session_key: state.sessionKey,
      category: state.category,
      winner: winner.title_ko,
      top4: state.top4.slice(0, 4).map(w => w.title_ko),
      winner_tier: winner.popularity_tier,
      lang: getLang(),
    }),
  }).catch(() => {});
}

function renderResultContent(isEn) {
  const winner = state.resultWinner;
  if (!winner) return;
  const second = state.top4[1]; // 준우승
  const third  = state.top4[2]; // 공동 3위 중 1명

  // eyebrow
  $('wc-result-eyebrow').textContent = isEn ? 'Your Pick' : '네가 선택한 우승작';

  // 1위 타이틀
  $('wc-result-title').textContent = isEn ? winner.title_en : winner.title_ko;

  // 1위 카드
  loadCoverCached(winner, $('wc-winner-bg'));
  $('wc-winner-hook').textContent  = isEn ? winner.hook_en  : winner.hook_ko;
  $('wc-winner-quote').textContent = getQuote(winner, isEn);

  if (second) {
    const s2card = $('wc-second-card');
    $('wc-second-label').textContent = isEn ? '🥈 Runner-up' : '🥈 준우승';
    $('wc-second-title').textContent = isEn ? second.title_en : second.title_ko;
    $('wc-second-hook').textContent  = isEn ? second.hook_en  : second.hook_ko;
    $('wc-second-quote').textContent = getQuote(second, isEn);
    loadCoverCached(second, $('wc-second-bg'));
    if (s2card) s2card.style.display = '';
  }

  if (third) {
    const s3card = $('wc-third-card');
    $('wc-third-label').textContent = isEn ? '🥉 3rd Place' : '🥉 공동 3위';
    $('wc-third-title').textContent = isEn ? third.title_en : third.title_ko;
    $('wc-third-hook').textContent  = isEn ? third.hook_en  : third.hook_ko;
    $('wc-third-quote').textContent = getQuote(third, isEn);
    loadCoverCached(third, $('wc-third-bg'));
    if (s3card) s3card.style.display = '';
  }

  // KIN 독해
  $('wc-obs-text').textContent = getWcObs(winner, isEn);
  $('wc-obs-avatar').src = KIN_IMGS.happy;

  // 버튼
  $('wc-btn-retry').textContent = isEn ? 'Try Again' : '다시 하기';
  const btnShare = $('wc-btn-share');
  const btnBracket = $('wc-btn-share-bracket');
  if (btnShare) btnShare.textContent = isEn ? 'Share' : '공유';
  if (btnBracket) btnBracket.textContent = isEn ? 'Share bracket' : '브라켓 공유';
}

// ── KIN 독해 문구 ──
function getWcObs(winner, isEn) {
  const tier = winner.popularity_tier;
  if (isEn) {
    if (tier === 'S') return `You went with the classic. ${winner.title_en} as your winner says you trust what's already been proven.`;
    if (tier === 'A') return `Interesting. You passed on the obvious choices and landed on ${winner.title_en}. That's a real preference, not just familiarity.`;
    return `${winner.title_en} winning this says something. You're not picking by reputation. You're picking by feel.`;
  }
  if (tier === 'S') return `${winner.title_ko}를 골랐구나. 검증된 걸 고른 거야. 근데 그게 네 취향이랑 딱 맞는다는 거잖아.`;
  if (tier === 'A') return `${winner.title_ko}까지 올라올 줄은 몰랐어. 유명한 것보다 네 결에 맞는 걸 고른 거야.`;
  return `${winner.title_ko}가 우승이라니. 인지도랑 상관없이 뭔가 다른 기준으로 고른 거야. 그 기준이 뭔지 나도 궁금하다.`;
}

// ── lang 전환 ──
function applyLang(l) {
  const isEn = l === 'en';
  $('h-title').textContent = isEn ? 'Work Worldcup' : '작품 월드컵';

  // 카테고리 선택 화면
  $('wc-intro-line').innerHTML = isEn
    ? "This isn't about picking the best manga.<br>It's about finding out where your taste actually lands."
    : "이건 최고의 만화를 뽑는 게임이 아니야.<br>네 취향이 어디로 기우는지 보는 월드컵이야.";
  const introSub = $('wc-intro-sub');
  if (introSub) introSub.innerHTML = isEn
    ? "Pick a category and the 16-team tournament begins.<br>In each matchup, choose whichever feels closer to your taste."
    : "카테고리를 선택하면 16강 토너먼트가 시작돼.<br>1:1 대결에서 네 취향에 더 가까운 쪽을 골라.";
  $('cat-battle-title').textContent = isEn ? 'Battle & Growth' : '소년 배틀·성장';
  $('cat-battle-sub').textContent   = isEn ? 'Action, rivalry, and the will to grow' : '성장, 전투, 우정이 강한 작품들';
  $('cat-thriller-title').textContent = isEn ? 'Psychological Drama' : '심리·드라마';
  $('cat-thriller-sub').textContent   = isEn ? 'Dark, tense, and hard to shake off' : '압박감과 해석 욕구가 남는 작품들';

  // 대진 중이면 텍스트 갱신 (selecting 중엔 스킵)
  if (!state.selecting && state.roundMatches.length > 0 && state.currentMatch < state.roundMatches.length) {
    renderMatch();
  }

  // 경로 토글 텍스트 갱신
  const toggle = $('wc-path-toggle');
  if (toggle) {
    const isOpen = $('wc-path-panel')?.classList.contains('open');
    toggle.textContent = isOpen
      ? (isEn ? 'My picks ↑' : '내 선택 ↑')
      : (isEn ? 'My picks ↓' : '내 선택 ↓');
  }

  // 결과 화면 lang 전환
  if (state.resultWinner) {
    renderResultContent(isEn);
  }
}

// ── 카테고리 선택 ──
document.querySelectorAll('.wc-cat-card').forEach(card => {
  card.addEventListener('click', async () => {
    state.category = card.dataset.category;
    showSection('wc-arena');

    try {
      const works = await loadWorks(state.category);
      state.works = selectWorks(works);
      if (state.works.length < 16) throw new Error('not enough works');

      const pairs = buildBracket(state.works);
      state.roundMatches = pairs;
      state.totalMatches = 15;   // 16강:8 + 8강:4 + 4강:2 + 결승:1 = 15
      state.round = 16;
      state.currentMatch = 0;
      state.winners = [];
      state.matchPlayed = 0;
      state.top4 = [];
      state.history = [];
      state.selecting = false;

      // 시작 KIN 배너
      const isEn = getLang() === 'en';
      showKinBanner(
        isEn
          ? "Not a ranking. Not a poll. Just your taste."
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

// ── 작품 클릭 ──
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

// ── 모바일 스와이프 (위 = 위쪽 카드 선택, 아래 = 아래쪽 카드 선택) ──
let touchStartY = 0, touchStartX = 0;
document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (state.selecting || !state.roundMatches[state.currentMatch]) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dy) < 55 || Math.abs(dx) > Math.abs(dy)) return; // 최소 55px 수직 스와이프
  const [workA, workB] = state.roundMatches[state.currentMatch];
  if (dy < 0) selectWork(workA, workB); // 위 스와이프 → 위쪽 카드(A) 선택
  else        selectWork(workB, workA); // 아래 스와이프 → 아래쪽 카드(B) 선택
}, { passive: true });

// ── 공유 버튼 ──
$('wc-btn-share').addEventListener('click', () => openShareModal(generateResultShareImage));
$('wc-btn-share-bracket').addEventListener('click', () => openShareModal(generateBracketShareImage));

$('wc-share-modal-close').addEventListener('click', () => {
  $('wc-share-modal').classList.remove('open');
});

$('wc-btn-share-save').addEventListener('click', async () => {
  if (!shareBlob) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    try {
      const file = new File([shareBlob], 'kin-worldcup.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: getLang() === 'en' ? "KIN Worldcup" : 'KIN 월드컵' });
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

// ── 경로 패널 토글 ──
$('wc-path-toggle').addEventListener('click', () => {
  const panel  = $('wc-path-panel');
  const toggle = $('wc-path-toggle');
  const isOpen = panel.classList.toggle('open');
  toggle.classList.toggle('open', isOpen);
  const isEn = getLang() === 'en';
  toggle.textContent = isOpen
    ? (isEn ? 'My picks ↑' : '내 선택 ↑')
    : (isEn ? 'My picks ↓' : '내 선택 ↓');
});

// ── 다시 하기 ──
$('wc-btn-retry').addEventListener('click', () => {
  Object.assign(state, {
    category: null, works: [], roundMatches: [], winners: [],
    top4: [], matchPlayed: 0, resultWinner: null,
    history: [], matchResults: [], initialPairs: [],
    selecting: false, sessionKey: genUUID(),
  });
  resultCoverCache.clear();
  const panel = $('wc-path-panel');
  if (panel) panel.classList.remove('open');
  const toggle = $('wc-path-toggle');
  if (toggle) {
    toggle.classList.remove('open');
    toggle.textContent = getLang() === 'en' ? 'My picks ↓' : '내 선택 ↓';
  }
  showSection('wc-category');
});

// ── 초기화 ──
(async () => {
  $('wc-loading').style.display = 'none';
  showSection('wc-category');
  applyLang(getLang());
})();
