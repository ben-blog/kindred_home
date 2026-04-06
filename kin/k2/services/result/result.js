// ═══════════════════════════════════════════
// result.js — 결과 페이지
// ═══════════════════════════════════════════
import {
  getLang, setLang, t,
  KIN_IMGS,
  supaFetch, loadImgCORS,
  getLabel, getObs, getReplayHint,
} from '../../lib/core.js';
import { initLangToggle, hideLoading } from '../../lib/ui.js';

// ── localStorage에서 퀴즈 결과 로드 ──
const raw = localStorage.getItem('k2_quiz_result');
if (!raw) {
  window.location.href = '/kin/k2/';
  throw new Error('no quiz data');
}
const data = JSON.parse(raw);

// 저장된 lang으로 초기화 (퀴즈 당시 언어 유지)
if (data.lang && data.lang !== getLang()) setLang(data.lang);

// ── lang 토글 초기화 ──
initLangToggle(applyResultLang);

// ── DOM 참조 ──
const $ = id => document.getElementById(id);

// ── 점수 카운트업 ──
function animateScore(target) {
  const el = $('result-score');
  if (!el) return;
  const duration = 400 + target * 70;
  const start = performance.now();
  const tick = now => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(ease * target);
    if (p < 1) requestAnimationFrame(tick);
    else {
      el.textContent = target;
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 300);
    }
  };
  requestAnimationFrame(tick);
}

// ── 작품 배경 설정 (worldcup_works.cover_url 우선, fallback bg) ──
const _bgFallback = () => `url(/kin/k2/assets/bg/bg${Math.floor(Math.random() * 10) + 1}.png)`;
let _cachedCoverUrl = null; // 공유카드 재사용용

async function setWorkBgByName(workName, bgId) {
  const bg = $(bgId);
  if (!bg) return;
  try {
    const rows = await supaFetch(`worldcup_works?title_ko=eq.${encodeURIComponent(workName)}&select=cover_url&limit=1`);
    const url = rows?.[0]?.cover_url;
    bg.style.backgroundImage = url ? `url(${url})` : _bgFallback();
    _cachedCoverUrl = url || null;
  } catch {
    bg.style.backgroundImage = _bgFallback();
    _cachedCoverUrl = null;
  }
}

// ── 결과 렌더 ──
function renderResult() {
  const lang       = getLang();
  const isEn       = lang === 'en';
  const { score, answers, questions, resultPattern, resultObs, topWork, resultMood, workScore } = data;

  // 점수
  $('result-score').textContent = '0';
  setTimeout(() => animateScore(score), 200);

  // 레이블 + 관찰
  if ($('result-label')) $('result-label').textContent = getLabel(resultPattern);
  if ($('result-observation-text')) $('result-observation-text').textContent = resultObs;

  // KIN 아바타
  const obsAvatar = $('result-obs-avatar');
  if (obsAvatar) {
    obsAvatar.onerror = () => { obsAvatar.src = KIN_IMGS.happy; };
    obsAvatar.src = KIN_IMGS[resultMood] || KIN_IMGS.happy;
  }

  // 작품 카드
  if (topWork) {
    $('result-work-card').style.display = 'block';
    $('result-kin-card').style.display = 'none';
    const displayName = isEn
      ? (answers.find(a => a.source_work === topWork.name)?.source_work_en || topWork.name)
      : topWork.name;
    $('result-work-name').textContent = displayName;
    $('result-work-sub').textContent = isEn
      ? `${topWork.correct} / ${topWork.total} correct`
      : `${topWork.total}문제 중 ${topWork.correct}개 정답`;
    setWorkBgByName(topWork.name, 'result-work-bg');
  } else {
    // topWork 없으면 세션 작품 중 cover_url 매칭 가능한 것 랜덤
    const fallback = workScore
      ? Object.entries(workScore).sort(() => Math.random() - .5)[0]
      : null;
    if (fallback) {
      const [fbName] = fallback;
      $('result-work-card').style.display = 'block';
      $('result-kin-card').style.display = 'none';
      const fbDisplayName = isEn
        ? (answers.find(a => a.source_work === fbName)?.source_work_en || fbName)
        : fbName;
      $('result-work-name').textContent = fbDisplayName;
      $('result-work-sub').textContent = isEn ? 'appeared this session' : '이번 세션 등장 작품';
      const wLabel = $('result-work-label');
      if (wLabel) wLabel.textContent = isEn ? 'this session' : '이번 세션 작품';
      setWorkBgByName(fbName, 'result-work-bg');
    } else {
      $('result-work-card').style.display = 'none';
      $('result-kin-card').style.display = 'block';
      $('result-kin-bg').style.backgroundImage = _bgFallback();
    }
  }

  // 틀린 문제
  renderWrongList(isEn);

  // 재플레이 힌트
  const replayEl = $('result-replay-hint');
  if (replayEl) replayEl.textContent = getReplayHint(resultPattern);

  // 버튼 텍스트
  applyStaticLang(isEn);
}

function renderWrongList(isEn) {
  const { answers, questions } = data;
  const wrong = answers.filter(a => !a.is_correct);
  const ws = $('result-wrong-section');
  const wl = $('result-wrong-list');
  if (!ws || !wl) return;
  wl.innerHTML = '';
  if (wrong.length > 0) {
    ws.style.display = 'block';
    wrong.forEach(a => {
      const item = questions.find(q => q.item_id === a.item_id);
      if (!item) return;
      const qText = isEn ? (item.question_en || item.question) : item.question;
      const ans   = isEn ? (item.correctAnswerEn || a.correct_answer) : (item.correctAnswerKo || a.correct_answer);
      const div   = document.createElement('div'); div.className = 'wrong-item';
      const qDiv  = document.createElement('div'); qDiv.textContent = qText.slice(0, 55) + (qText.length > 55 ? '…' : '');
      const aDiv  = document.createElement('div'); aDiv.className = 'wrong-item-answer'; aDiv.textContent = `→ ${ans}`;
      div.appendChild(qDiv); div.appendChild(aDiv);
      wl.appendChild(div);
    });
  } else {
    ws.style.display = 'none';
  }
}

function applyStaticLang(isEn) {
  if ($('result-eyebrow')) $('result-eyebrow').textContent = isEn ? "KIN's Verdict" : 'KIN의 판정';
  if ($('result-wrong-label')) $('result-wrong-label').textContent = isEn ? 'Missed' : '틀린 문제';
  if ($('btn-share'))   $('btn-share').textContent   = isEn ? 'Share'     : '공유하기';
  if ($('btn-retry'))   $('btn-retry').textContent   = isEn ? 'Try Again' : '다시 하기';
  if ($('btn-gallery')) $('btn-gallery').textContent = isEn ? '← Gallery' : '← 갤러리';
}

// ── lang 전환 ──
function applyResultLang(l) {
  const isEn = l === 'en';
  const { answers, questions, resultPattern, topWork, workScore } = data;

  // 레이블
  if ($('result-label') && resultPattern) $('result-label').textContent = getLabel(resultPattern);
  // obs
  const obsText = $('result-observation-text');
  if (obsText && resultPattern) obsText.textContent = getObs(resultPattern);
  // 작품명
  const workNameEl = $('result-work-name');
  if (workNameEl && topWork) {
    workNameEl.textContent = isEn
      ? (answers.find(a => a.source_work === topWork.name)?.source_work_en || topWork.name)
      : topWork.name;
  }
  // work-sub
  const sub = $('result-work-sub');
  if (sub && topWork) {
    sub.textContent = isEn
      ? `${topWork.correct} / ${topWork.total} correct`
      : `${topWork.total}문제 중 ${topWork.correct}개 정답`;
  }
  // work-label
  const workLabel = document.getElementById('result-work-label');
  if (workLabel) {
    workLabel.textContent = topWork
      ? (isEn ? 'You know this one' : '가장 잘 아는 작품')
      : (isEn ? 'this session'      : '이번 세션 작품');
  }
  // 틀린 문제
  renderWrongList(isEn);
  // 재플레이 힌트
  const replayEl = $('result-replay-hint');
  if (replayEl && resultPattern) replayEl.textContent = getReplayHint(resultPattern);
  // 정적 텍스트
  applyStaticLang(isEn);
}

// ── 공유 카드 생성 ──
let shareBlob = null, shareBlobUrl = null;

async function generateShareImage() {
  if (!window.html2canvas) throw new Error('html2canvas not loaded');
  const { score, resultObs, resultPattern, resultMood, topWork } = data;
  const obs  = resultObs || getObs(resultPattern || 'random');
  const mood = resultMood || 'thinking';

  $('sc-kin-face').src = KIN_IMGS[mood] || KIN_IMGS.thinking;
  $('sc-bubble').textContent = `"${obs}"`;
  $('sc-score-num').textContent = score;
  $('sc-bar').style.width = `${score * 10}%`;
  const scLabel = $('sc-label');
  if (scLabel && resultPattern) scLabel.textContent = getLabel(resultPattern);
  const scTitle = $('sc-header-title');
  if (scTitle) scTitle.textContent = getLang() === 'en' ? "What kind of fan? — KIN's Verdict" : '난 어떤 덕후? — KIN의 판정';

  // 커버 배경 (캐시 재사용, 없으면 재조회)
  const coverBg = $('sc-cover-bg');
  if (coverBg) coverBg.style.backgroundImage = '';
  if (topWork?.name) {
    const coverUrl = _cachedCoverUrl || await supaFetch(
      `worldcup_works?title_ko=eq.${encodeURIComponent(topWork.name)}&select=cover_url&limit=1`
    ).then(r => r?.[0]?.cover_url).catch(() => null);
    if (coverUrl && coverBg) coverBg.style.backgroundImage = `url(${coverUrl})`;
  }

  await loadImgCORS($('sc-kin-face'), KIN_IMGS[mood] || KIN_IMGS.thinking).catch(() => {});

  const canvas = await html2canvas($('share-card'), {
    backgroundColor: '#080806', scale: 2, useCORS: true, logging: false,
  });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 공유 버튼
$('btn-share').addEventListener('click', async () => {
  const modal   = $('share-modal');
  const loading = $('share-modal-loading');
  const imgEl   = $('share-modal-img');
  const btns    = $('share-modal-btns');
  modal.classList.add('open');
  loading.style.display = 'block';
  imgEl.style.display = 'none';
  btns.style.display  = 'none';
  try {
    shareBlob = await generateShareImage();
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl = URL.createObjectURL(shareBlob);
    imgEl.src = shareBlobUrl;
    imgEl.style.display = 'block';
    btns.style.display  = 'flex';
  } catch {
    modal.classList.remove('open');
    const obs  = data.resultObs || getObs(data.resultPattern || 'random');
    const text = t(
      `KIN의 만화퀴즈 ${data.score}/10\n"${obs}"\nkinxdred.com/kin/k2`,
      `KIN's Manga Quiz ${data.score}/10\n"${obs}"\nkinxdred.com/kin/k2`
    );
    try { await navigator.clipboard.writeText(text); } catch {}
  } finally {
    loading.style.display = 'none';
  }
});

// 저장하기
$('btn-share-save').addEventListener('click', async () => {
  if (!shareBlob) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    try {
      const file = new File([shareBlob], 'kin-quiz.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: t('KIN의 판정', "KIN's Verdict") });
    } catch { window.open(shareBlobUrl, '_blank'); }
  } else {
    const a = document.createElement('a');
    a.href = shareBlobUrl; a.download = `kin-quiz-${data.score}.png`; a.click();
  }
});

// 공유하기 (네이티브)
$('btn-share-native').addEventListener('click', async () => {
  if (!shareBlob) return;
  const file  = new File([shareBlob], 'kin-quiz.png', { type: 'image/png' });
  const title = t('KIN의 만화퀴즈', "KIN's Manga Quiz");
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `${data.score}/10 — kinxdred.com/kin/k2` });
    } else {
      await navigator.share({ title, url: 'https://kinxdred.com/kin/k2' });
    }
  } catch {}
});

// 모달 닫기
$('share-modal-close').addEventListener('click', () => {
  $('share-modal').classList.remove('open');
});

// 다시 하기
$('btn-retry').addEventListener('click', () => {
  window.location.href = '/kin/k2/quiz';
});

// ── 초기화 ──
renderResult();
hideLoading();
