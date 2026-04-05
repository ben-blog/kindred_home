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

// ── DOM ──
const $ = id => document.getElementById(id);

// ── 상태 ──
const state = {
  category: null,
  works: [],
  roundMatches: [],   // 현재 라운드 매치 목록
  currentMatch: 0,
  winners: [],        // 현재 라운드 승자
  round: 16,
  totalMatches: 15,   // 16강:8 + 8강:4 + 4강:2 + 결승:1 = 15
  matchPlayed: 0,
  sessionKey: genUUID(),
  top4: [],           // [1위, 2위, 3위, 3위] 순서로 완성됨
  resultWinner: null,
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
  const shuffle = arr => [...arr].sort(() => Math.random() - .5);
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
  const S = works.filter(w => w.popularity_tier === 'S');
  const rest = works.filter(w => w.popularity_tier !== 'S');
  const shuffle = arr => [...arr].sort(() => Math.random() - .5);

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
  const labels = {
    ko: { 16: '16강', 8: '8강', 4: '4강', 2: '결승' },
    en: { 16: 'Round of 16', 8: 'Quarter-final', 4: 'Semi-final', 2: 'Final' },
  };
  return (getLang() === 'ko' ? labels.ko : labels.en)[round] || `${round}강`;
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

  $('wc-title-a').textContent = isEn ? workA.title_en : workA.title_ko;
  $('wc-hook-a').textContent  = isEn ? workA.hook_en  : workA.hook_ko;
  $('wc-title-b').textContent = isEn ? workB.title_en : workB.title_ko;
  $('wc-hook-b').textContent  = isEn ? workB.hook_en  : workB.hook_ko;

  // 배경 이미지 병렬 로드
  $('wc-bg-a').style.backgroundImage = '';
  $('wc-bg-b').style.backgroundImage = '';
  loadCover(workA, $('wc-bg-a'));
  loadCover(workB, $('wc-bg-b'));

  // 라운드 표시
  $('wc-round-label').textContent = getRoundLabel(state.round);
  $('wc-progress-text').textContent = `${state.matchPlayed + 1} / ${state.totalMatches}`;

  // 결승 직전 KIN 배너
  if (state.round === 2) {
    const text = isEn
      ? "Here's where your real taste shows."
      : "여기서 진짜 취향이 갈려.";
    showKinBanner(text, 'serious');
  }
}

// ── 선택 처리 ──
async function selectWork(winner, loser) {
  // TOP4 추적
  // 4강 패자 2명 = 공동 3위 (먼저 push)
  if (state.round === 4) state.top4.push(loser);

  state.winners.push(winner);
  state.currentMatch++;
  state.matchPlayed++;

  if (state.currentMatch < state.roundMatches.length) {
    await renderMatch();
  } else {
    if (state.winners.length === 1) {
      // 결승 완료 — winners[0]이 우승자, loser가 준우승
      // top4 현재 상태: [4강패자1, 4강패자2]
      // 최종: [우승, 준우승, 4강패자1, 4강패자2]
      state.top4 = [state.winners[0], loser, ...state.top4];
      state.resultWinner = state.winners[0];
      await showResult(state.winners[0]);
    } else {
      // 다음 라운드
      state.round = state.round / 2;
      state.roundMatches = [];
      for (let i = 0; i < state.winners.length; i += 2) {
        if (state.winners[i + 1]) {
          state.roundMatches.push([state.winners[i], state.winners[i + 1]]);
        }
      }
      state.winners = [];
      state.currentMatch = 0;
      await renderMatch();
    }
  }
}

// ── 결과 화면 ──
async function showResult(winner) {
  showSection('wc-result');
  const isEn = getLang() === 'en';

  // 타이틀
  $('wc-result-title').textContent = isEn ? winner.title_en : winner.title_ko;

  // 우승작 배경
  loadCover(winner, $('wc-winner-bg'));
  $('wc-winner-label').textContent = isEn ? 'Your winner' : '이번 월드컵 우승';

  // TOP4
  const top4El = $('wc-top4');
  top4El.innerHTML = '';
  const ranks = isEn
    ? ['🥇 1st', '🥈 2nd', '🥉 3rd', '🥉 3rd']
    : ['🥇 우승', '🥈 준우승', '🥉 3위', '🥉 3위'];
  state.top4.slice(0, 4).forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'wc-top4-item';
    el.innerHTML = `<div class="wc-top4-rank">${ranks[i]}</div><div class="wc-top4-name">${isEn ? w.title_en : w.title_ko}</div>`;
    top4El.appendChild(el);
  });

  // KIN 독해
  const obs = getWcObs(winner, state.category, isEn);
  $('wc-obs-text').textContent = obs;
  const obsAvatar = $('wc-obs-avatar');
  obsAvatar.src = KIN_IMGS.happy;

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

// ── KIN 독해 문구 ──
function getWcObs(winner, category, isEn) {
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
  $('cat-battle-title').textContent = isEn ? 'Battle & Growth' : '소년 배틀·성장';
  $('cat-battle-sub').textContent   = isEn ? 'Action, rivalry, and the will to grow' : '성장, 전투, 우정이 강한 작품들';
  $('cat-thriller-title').textContent = isEn ? 'Psychological Drama' : '심리·드라마';
  $('cat-thriller-sub').textContent   = isEn ? 'Dark, tense, and hard to shake off' : '압박감과 해석 욕구가 남는 작품들';

  // 대진 중이면 텍스트 갱신
  if (state.roundMatches.length > 0 && state.currentMatch < state.roundMatches.length) {
    renderMatch();
  }

  // 결과 화면 lang 전환
  if (state.resultWinner) {
    const w = state.resultWinner;
    $('wc-result-eyebrow').textContent = isEn ? "KIN's Verdict" : 'KIN의 판정';
    $('wc-result-title').textContent = isEn ? w.title_en : w.title_ko;
    $('wc-winner-label').textContent = isEn ? 'Your winner' : '이번 월드컵 우승';
    $('wc-obs-text').textContent = getWcObs(w, state.category, isEn);
    // TOP4 재렌더
    const top4El = $('wc-top4');
    const ranks = isEn
      ? ['🥇 1st', '🥈 2nd', '🥉 3rd', '🥉 3rd']
      : ['🥇 우승', '🥈 준우승', '🥉 3위', '🥉 3위'];
    top4El.innerHTML = '';
    state.top4.slice(0, 4).forEach((wk, i) => {
      const el = document.createElement('div');
      el.className = 'wc-top4-item';
      el.innerHTML = `<div class="wc-top4-rank">${ranks[i]}</div><div class="wc-top4-name">${isEn ? wk.title_en : wk.title_ko}</div>`;
      top4El.appendChild(el);
    });
    // 버튼
    const retryBtn = $('wc-btn-retry');
    if (retryBtn) retryBtn.textContent = isEn ? 'Try Again' : '다시 하기';
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
      state.totalMatches = 15; // 16강: 8 + 4강: 4 + 결승: 2 + 준결승: 1 = 15
      state.round = 16;
      state.currentMatch = 0;
      state.winners = [];
      state.matchPlayed = 0;
      state.top4 = [];

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
  const [workA, workB] = state.roundMatches[state.currentMatch];
  selectWork(workA, workB);
});
$('wc-work-b').addEventListener('click', () => {
  const [workA, workB] = state.roundMatches[state.currentMatch];
  selectWork(workB, workA);
});

// ── 다시 하기 ──
$('wc-btn-retry').addEventListener('click', () => {
  state.category = null;
  state.works = [];
  state.roundMatches = [];
  state.winners = [];
  state.top4 = [];
  state.matchPlayed = 0;
  state.sessionKey = genUUID();
  showSection('wc-category');
});

// ── 초기화 ──
(async () => {
  $('wc-loading').style.display = 'none';
  showSection('wc-category');
  applyLang(getLang());
})();
