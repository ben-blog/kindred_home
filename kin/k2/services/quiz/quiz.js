// ═══════════════════════════════════════════
// quiz.js — 퀴즈 서비스
// ═══════════════════════════════════════════
import {
  getLang, t, onLangChange,
  SUPA_URL, SUPA_KEY, API_URL,
  KIN_IMGS, BG_IMAGES,
  SLOTS, FORMAT_LABELS,
  supaFetch, supaCount, genUUID,
  getRandomBg, fetchAniListCover,
  getRxn, getStreakRxn,
  detectPattern, getLabel, getObs, getReplayHint,
} from '../../lib/core.js';
import { initLangToggle, lockLang, unlockLang, showError, hideLoading } from '../../lib/ui.js';

// ── DOM 캐시 ──
const $ = id => document.getElementById(id);
const DOM = {
  diffOverlay:  $('diff-overlay'),
  streakGlow:   $('streak-glow'),
  quizBgImg:    $('quiz-bg-img'),
  quizProgress: $('quiz-progress'),
  qBadge:       $('q-format-badge'),
  qDiffDots:    $('q-diff-dots'),
  qCounter:     $('q-counter'),
  qQuestion:    $('q-question'),
  qChoices:     $('q-choices'),
  kinReaction:  $('kin-reaction'),
  kinBubble:    $('kin-rxn-bubble'),
  kinAvatar:    $('kin-rxn-avatar'),
  btnNext:      $('btn-next'),
  swipeHint:    $('swipe-hint'),
};

// ── 상태 ──
const state = {
  questions: [], currentIndex: 0,
  answers: [], score: 0, streak: 0,
  sessionKey: genUUID(), answered: false,
};

// ── 언어 초기화 ──
initLangToggle(applyQuizLang);

function applyQuizLang(l) {
  // 현재 문제 텍스트 갱신
  const q = state.questions[state.currentIndex];
  if (!q) return;
  DOM.qBadge.textContent = (l === 'ko' ? FORMAT_LABELS.ko : FORMAT_LABELS.en)[q.format] || q.format;
  DOM.qQuestion.textContent = l === 'ko' ? q.question : (q.question_en || q.question);
  // 선택지 갱신
  const choices = l === 'ko' ? q.displayChoicesKo : (q.displayChoicesEn || q.displayChoicesKo);
  DOM.qChoices.querySelectorAll('.choice-btn').forEach((btn, i) => {
    if (choices[i]) btn.textContent = choices[i].trim();
  });
  // 다음/결과 버튼
  const isLast = state.currentIndex === state.questions.length - 1;
  if (!DOM.btnNext.classList.contains('show')) return;
  DOM.btnNext.textContent = isLast ? t('결과 보기 →', 'See Result →') : t('다음 →', 'Next →');
  // 스와이프 힌트
  if (DOM.swipeHint.classList.contains('show')) {
    DOM.swipeHint.textContent = t('↑ 스와이프 또는 다음 →', '↑ swipe or next →');
  }
}

// ── Supabase: 슬롯 카운트 ──
async function getSlotCount(format, difficulty) {
  return supaCount(`quiz_items?format=eq.${format}&difficulty=eq.${difficulty}&is_active=eq.true&select=item_id`);
}

// ── 문제 로드 ──
async function loadQuestions() {
  const counts = await Promise.all(
    SLOTS.map(slot => getSlotCount(slot.format, slot.difficulty).catch(() => 0))
  );
  const seenWorks = new Set();
  const MAX_RETRY = 4;

  async function fetchSlot(slot, total) {
    if (total === 0) return null;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const offset = Math.floor(Math.random() * total);
      const item = await supaFetch(
        `quiz_items?format=eq.${slot.format}&difficulty=eq.${slot.difficulty}&is_active=eq.true&limit=1&offset=${offset}&order=item_id.asc`,
        { headers: { Prefer: 'return=representation' } }
      ).then(res => Array.isArray(res) ? res[0] : res).catch(() => null);

      if (!item) return null;
      const work = item.source_work;
      if (slot.format === 'author' || !work || !seenWorks.has(work)) {
        if (work && slot.format !== 'author') seenWorks.add(work);
        return item;
      }
    }
    const offset = Math.floor(Math.random() * total);
    return supaFetch(
      `quiz_items?format=eq.${slot.format}&difficulty=eq.${slot.difficulty}&is_active=eq.true&limit=1&offset=${offset}&order=item_id.asc`,
      { headers: { Prefer: 'return=representation' } }
    ).then(res => Array.isArray(res) ? res[0] : res).catch(() => null);
  }

  const results = [];
  for (let i = 0; i < SLOTS.length; i++) {
    results.push(await fetchSlot(SLOTS[i], counts[i]));
  }

  return results.filter(Boolean).map(item => {
    const correctKo = item.choices[0];
    const correctEn = item.choices_en?.[0] || item.answer_en;
    const shuffledKo = [...item.choices].sort(() => Math.random() - .5);
    const shuffledEn = item.choices_en ? [...item.choices_en].sort(() => Math.random() - .5) : null;
    return { ...item, displayChoicesKo: shuffledKo, displayChoicesEn: shuffledEn, correctAnswerKo: correctKo, correctAnswerEn: correctEn };
  });
}

// ── 진행 바 초기화 ──
function initProgressTrack() {
  const wrap = DOM.quizProgress;
  wrap.innerHTML = '';
  const bg = document.createElement('div');
  bg.className = 'prog-track-bg'; bg.id = 'prog-track-bg';
  const segWrap = document.createElement('div');
  segWrap.id = 'prog-segs';
  segWrap.style.cssText = 'position:absolute;inset:0;border-radius:3px;overflow:hidden;display:flex;';
  bg.appendChild(segWrap);
  wrap.appendChild(bg);
  const divWrap = document.createElement('div');
  divWrap.className = 'prog-dividers';
  SLOTS.forEach(() => { const d = document.createElement('div'); d.className = 'prog-div'; divWrap.appendChild(d); });
  bg.appendChild(divWrap);
  SLOTS.forEach((slot, i) => {
    const pct = ((i + 1) / SLOTS.length) * 100;
    const m = document.createElement('div');
    m.className = `prog-marker upcoming-${slot.difficulty}`;
    m.id = `prog-marker-${i}`;
    m.style.left = pct + '%';
    bg.appendChild(m);
  });
  const runner = document.createElement('div');
  runner.className = 'kin-runner'; runner.id = 'kin-runner'; runner.style.left = '0%';
  runner.innerHTML = `<img class="kin-icon" id="kin-icon" src="${KIN_IMGS.thinking}" alt="KIN"><div class="kin-shadow"></div>`;
  wrap.appendChild(runner);
}

function renderProgress() {
  if (!document.getElementById('kin-runner') || state.currentIndex === 0) initProgressTrack();
  const segWrap = document.getElementById('prog-segs');
  if (!segWrap) return;
  segWrap.innerHTML = '';
  for (let i = 0; i < state.currentIndex; i++) {
    const ans = state.answers[i];
    const slot = SLOTS[i];
    const seg = document.createElement('div');
    seg.className = 'prog-seg ' + (ans?.is_correct ? `done-${slot.difficulty}` : 'done-wrong');
    seg.style.width = (100 / SLOTS.length) + '%';
    segWrap.appendChild(seg);
  }
  const runner = document.getElementById('kin-runner');
  if (runner) runner.style.left = (state.currentIndex / SLOTS.length * 100) + '%';
  SLOTS.forEach((_, i) => {
    const m = document.getElementById(`prog-marker-${i}`);
    if (m) m.style.opacity = i < state.currentIndex ? '0' : '0.5';
  });
}

function flashProgressDot(index, isCorrect) {
  const runner = document.getElementById('kin-runner');
  const icon   = document.getElementById('kin-icon');
  if (!runner) return;
  runner.classList.remove('jump', 'stumble');
  void runner.offsetWidth;
  runner.classList.add(isCorrect ? 'jump' : 'stumble');
  if (icon) {
    icon.src = isCorrect ? KIN_IMGS.happy : KIN_IMGS.sad;
    setTimeout(() => { if (icon) icon.src = KIN_IMGS.thinking; }, 600);
  }
  setTimeout(() => runner.classList.remove('jump', 'stumble'), 500);
}

// ── 난이도 오버레이 ──
function setDiffOverlay(difficulty) {
  const map = { easy: 'rgba(0,0,0,0)', mid: 'rgba(20,30,70,0.15)', hard: 'rgba(70,15,15,0.18)' };
  DOM.diffOverlay.style.background = map[difficulty] || 'rgba(0,0,0,0)';
}

// ── 퀴즈 배경 ──
function setQuizBg() { DOM.quizBgImg.src = getRandomBg(); }

// ── 연속 정답 이펙트 ──
function updateStreakEffect(streak) {
  clearStreakEffect();
  if (streak >= 7)      { DOM.streakGlow.classList.add('s7'); spawnParticles(7); flashScreen(); }
  else if (streak >= 5) { DOM.streakGlow.classList.add('s5'); spawnParticles(4); }
  else if (streak >= 3) { DOM.streakGlow.classList.add('s3'); }
}
function clearStreakEffect() { DOM.streakGlow.classList.remove('s3', 's5', 's7'); }
function spawnParticles(n) {
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'streak-particle';
    p.style.left = (10 + Math.random() * 80) + '%';
    p.style.setProperty('--r', (Math.random() * 30 - 15) + 'deg');
    p.style.animationDelay = (Math.random() * 0.2) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}
function flashScreen() {
  const fl = document.createElement('div');
  Object.assign(fl.style, { position: 'fixed', inset: '0', zIndex: '95', background: 'rgba(255,229,0,.08)', pointerEvents: 'none', animation: 'flash-fade .4s ease forwards' });
  document.body.appendChild(fl);
  setTimeout(() => fl.remove(), 500);
}

// ── KIN 반응 이미지 ──
function getKinRxnImg(isCorrect, difficulty, isStreak) {
  if (isStreak) return KIN_IMGS.excited;
  if (isCorrect) return difficulty === 'hard' ? KIN_IMGS.excited : difficulty === 'mid' ? KIN_IMGS.happy : KIN_IMGS.thinking;
  return difficulty === 'easy' ? KIN_IMGS.sad : difficulty === 'mid' ? KIN_IMGS.serious : KIN_IMGS.thinking;
}

// ── 타이핑 이펙트 ──
function typeText(el, text, speed = 28) {
  el.textContent = '';
  const parent = el.closest('.kin-reaction');
  if (parent) parent.classList.add('show');
  else el.classList.add('show');
  let i = 0;
  const tick = () => { if (i < text.length) { el.textContent += text[i++]; setTimeout(tick, speed); } };
  tick();
}

// ── 햅틱 ──
function haptic(type) {
  if (!navigator.vibrate) return;
  type === 'correct' ? navigator.vibrate(40) : navigator.vibrate([35, 25, 35]);
}

// ── 문제 렌더 ──
function renderQuestion() {
  const q = state.questions[state.currentIndex];
  if (!q) return;
  state.answered = false;
  const lang = getLang();
  const diff = q.difficulty;
  setDiffOverlay(diff);
  setQuizBg();

  DOM.qBadge.className = `format-badge ${q.format}`;
  DOM.qBadge.textContent = (lang === 'ko' ? FORMAT_LABELS.ko : FORMAT_LABELS.en)[q.format] || q.format;

  const levels = { easy: 1, mid: 2, hard: 3 };
  if (DOM.qDiffDots.children.length === 0) {
    for (let i = 0; i < 3; i++) DOM.qDiffDots.appendChild(document.createElement('div'));
  }
  const dotKids = DOM.qDiffDots.children;
  for (let i = 0; i < 3; i++) dotKids[i].className = 'diff-dot' + (i < levels[diff] ? ` on-${diff}` : '');

  DOM.qCounter.innerHTML = `<span style="color:rgba(255,255,255,.85)">${state.currentIndex + 1}</span><span style="font-size:.55em;letter-spacing:.02em;color:rgba(255,255,255,.35);margin-left:2px"> / ${state.questions.length}</span>`;

  DOM.qQuestion.className = 'quiz-question';
  if (q.direction === 'recall') DOM.qQuestion.classList.add('direction-recall');
  else if (q.direction === 'explain') DOM.qQuestion.classList.add('direction-explain');
  DOM.qQuestion.classList.add(`diff-${diff}`);
  const enterClass = diff === 'easy' ? 'enter-fade' : diff === 'mid' ? 'enter-up' : 'enter-side';
  DOM.qQuestion.textContent = lang === 'ko' ? q.question : (q.question_en || q.question);
  void DOM.qQuestion.offsetWidth;
  DOM.qQuestion.classList.add(enterClass);

  DOM.qChoices.innerHTML = '';
  const choices = lang === 'ko' ? q.displayChoicesKo : (q.displayChoicesEn || q.displayChoicesKo);
  choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    if (diff === 'hard') { btn.classList.add('stagger'); btn.style.animationDelay = (idx * 0.08) + 's'; }
    btn.textContent = choice.trim();
    btn.addEventListener('click', () => selectAnswer(choice.trim()));
    DOM.qChoices.appendChild(btn);
  });

  DOM.kinBubble.textContent = '';
  DOM.kinAvatar.src = '';
  DOM.kinReaction.classList.remove('show');
  DOM.btnNext.classList.remove('show');
  DOM.btnNext.textContent = t('다음 →', 'Next →');
}

// ── 답변 선택 ──
function selectAnswer(selected) {
  if (state.answered) return;
  state.answered = true;
  const q = state.questions[state.currentIndex];
  const lang = getLang();
  const correct = lang === 'ko' ? q.correctAnswerKo.trim() : (q.correctAnswerEn || q.correctAnswerKo).trim();
  const isCorrect = selected === correct;

  if (isCorrect) { state.score++; state.streak++; }
  else { state.streak = 0; clearStreakEffect(); }

  haptic(isCorrect ? 'correct' : 'wrong');
  flashProgressDot(state.currentIndex, isCorrect);

  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) btn.classList.add('correct');
    else if (btn.textContent === selected && !isCorrect) btn.classList.add('wrong');
    else btn.classList.add('faded');
  });

  if (!isCorrect) {
    setTimeout(() => {
      DOM.qChoices.querySelectorAll('.choice-btn.correct').forEach(b => {
        b.classList.add('attention');
        const badge = document.createElement('span');
        badge.className = 'answer-badge';
        badge.textContent = t('정답', 'answer');
        b.appendChild(badge);
      });
    }, 200);
  }

  DOM.swipeHint.textContent = t('↑ 스와이프 또는 다음 →', '↑ swipe or next →');
  DOM.swipeHint.classList.remove('show');
  void DOM.swipeHint.offsetWidth;
  DOM.swipeHint.classList.add('show');

  state.answers.push({
    item_id: q.item_id, format: q.format, difficulty: q.difficulty,
    source_work: q.source_work, source_work_en: q.source_work_en,
    is_correct: isCorrect, selected, correct_answer: correct,
  });

  let rxnText;
  if (isCorrect && state.streak >= 3) { updateStreakEffect(state.streak); rxnText = getStreakRxn(state.streak); }
  else { rxnText = getRxn(isCorrect, q.difficulty); }

  const isStreakReaction = isCorrect && state.streak >= 3;
  DOM.kinAvatar.src = getKinRxnImg(isCorrect, q.difficulty, isStreakReaction);
  typeText(DOM.kinBubble, rxnText, 25);

  const isLast = state.currentIndex === state.questions.length - 1;
  DOM.btnNext.textContent = isLast ? t('결과 보기 →', 'See Result →') : t('다음 →', 'Next →');
  setTimeout(() => DOM.btnNext.classList.add('show'), 350);
}

// ── 다음 문제 ──
function goNext() {
  state.currentIndex++;
  if (state.currentIndex < state.questions.length) {
    renderProgress(); renderQuestion();
  } else {
    clearStreakEffect();
    setDiffOverlay('easy');
    finishQuiz();
  }
}
DOM.btnNext.addEventListener('click', goNext);

// ── 스와이프 (모바일) ──
let touchStartY = 0, touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!state.answered) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (dy < -60 && Math.abs(dx) < 40) goNext();
}, { passive: true });

// ── 퀴즈 완료 → 결과로 이동 ──
async function finishQuiz() {
  lockLang();
  // 결과 계산
  const pattern = detectPattern(state.answers);
  const obs     = getObs(pattern);
  const obsMood = state.score >= 9 ? 'excited' : state.score >= 7 ? 'happy' : state.score >= 5 ? 'thinking' : state.score >= 3 ? 'serious' : 'sad';

  // 가장 잘 아는 작품 계산
  const workScore = {};
  state.answers.forEach(a => {
    const w = a.source_work || '?';
    if (!workScore[w]) workScore[w] = { total: 0, correct: 0, mal_id: null };
    workScore[w].total++;
    if (a.is_correct) workScore[w].correct++;
    const q = state.questions.find(q => q.item_id === a.item_id);
    if (q?.mal_id) workScore[w].mal_id = q.mal_id;
  });

  const topEntry = Object.entries(workScore)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => {
      const rd = (b.correct / b.total) - (a.correct / a.total);
      return rd !== 0 ? rd : b.total - a.total;
    })[0];

  let topWork = null;
  if (topEntry) {
    const [workName, wData] = topEntry;
    topWork = { name: workName, ...wData };
  }

  // localStorage에 결과 저장
  localStorage.setItem('k2_quiz_result', JSON.stringify({
    score: state.score,
    answers: state.answers,
    questions: state.questions.map(q => ({
      item_id: q.item_id,
      question: q.question,
      question_en: q.question_en,
      correctAnswerKo: q.correctAnswerKo,
      correctAnswerEn: q.correctAnswerEn,
      source_work: q.source_work,
      source_work_en: q.source_work_en,
      mal_id: q.mal_id,
    })),
    resultPattern: pattern,
    resultObs: obs,
    topWork,
    resultMood: obsMood,
    workScore,
    lang: getLang(),
  }));
  localStorage.setItem('k2_quiz_done', '1');

  // KIN 에이전트 이벤트 (fire-and-forget)
  fetch(`${API_URL}/api/kin/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'k2_manga', event_type: 'quiz_completed',
      payload: { count: 1, lang: getLang(), result_pattern: pattern },
    }),
  }).catch(() => {});

  // Supabase 세션 저장 (fire-and-forget)
  const diffMix = state.answers.reduce((acc, a) => { acc[a.difficulty] = (acc[a.difficulty] || 0) + 1; return acc; }, { easy: 0, mid: 0, hard: 0 });
  supaFetch('quiz_sessions', {
    method: 'POST',
    body: JSON.stringify({
      session_key: state.sessionKey, score: state.score, total: 10,
      result_type: pattern, lang: getLang(),
      answers: state.answers, difficulty_mix: diffMix,
      format_mix: Object.fromEntries(
        ['work', 'character', 'outlier', 'author', 'relation'].map(f => [f, state.answers.filter(a => a.format === f).length])
      ),
    }),
  }).catch(() => {});

  // 결과 페이지로 이동
  window.location.href = '/kin/k2/result';
}

// ── 퀴즈 시작 ──
let quizLoading = false;
async function startQuiz() {
  if (quizLoading) return;
  quizLoading = true;
  lockLang();
  DOM.qQuestion.textContent = t('불러오는 중...', 'Loading...');
  DOM.qChoices.innerHTML = '';

  try {
    state.questions = await loadQuestions();
    if (state.questions.length < 5) throw new Error('not enough');
  } catch {
    showError(t('문제를 불러오지 못했어.', 'Could not load questions.'));
    unlockLang();
    quizLoading = false;
    return;
  }

  quizLoading = false;
  state.currentIndex = 0; state.answers = []; state.score = 0; state.streak = 0; state.answered = false;
  clearStreakEffect();
  setDiffOverlay('easy');
  DOM.quizProgress.innerHTML = '';
  renderProgress();
  renderQuestion();
}

// ── 초기화 ──
(async () => {
  hideLoading();
  await startQuiz();
})();
