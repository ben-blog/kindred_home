// ═══════════════════════════════════════════
// ui.js — K2 공통 DOM 컴포넌트
// ═══════════════════════════════════════════
import { getLang, setLang, onLangChange, t } from './core.js';

// ── 헤더 lang 토글 초기화 ──
export function initLangToggle(onChangeCb) {
  const ltBtns = document.querySelectorAll('.lt');

  // 초기 active 상태
  const cur = getLang();
  ltBtns.forEach(el => el.classList.toggle('active', el.dataset.lang === cur));

  // 클릭 핸들러
  ltBtns.forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('disabled')) return;
      setLang(el.dataset.lang);
    });
  });

  // 변경 시 버튼 + 헤더 타이틀 갱신
  onLangChange(l => {
    ltBtns.forEach(el => el.classList.toggle('active', el.dataset.lang === l));
    const hTitle = document.getElementById('h-title');
    if (hTitle) hTitle.textContent = l === 'en' ? 'What kind of fan?' : '난 어떤 덕후?';
    if (onChangeCb) onChangeCb(l);
  });
}

// ── lang 잠금 / 해제 ──
export function lockLang() {
  document.querySelectorAll('.lt').forEach(e => e.classList.add('disabled'));
}
export function unlockLang() {
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('disabled'));
}

// ── 에러 토스트 ──
export function showError(msg) {
  const el = document.getElementById('error-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ── 로딩 오버레이 ──
export function hideLoading() {
  const el = document.getElementById('loading');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 400);
}
