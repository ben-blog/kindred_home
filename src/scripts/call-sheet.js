/**
 * Phone layout for the leader call. Desktop leaves the sphere and the trace
 * where the page put them. A narrow viewport moves both into a bottom sheet.
 */
const mobileQuery = () => window.matchMedia('(max-width: 800px)');

export function mountCallSheet() {
  const root = document.querySelector('.call');
  const sheet = document.querySelector('#call-sheet');
  const panel = document.querySelector('#call-sheet-panel');
  const view = document.querySelector('#call-memory-view');
  const think = document.querySelector('#call-think');
  const memory = document.querySelector('#call-memory');
  const log = document.querySelector('#call-log');
  if (!root || !sheet || !panel || !view || !think || !memory || !log || root.dataset.sheet === '1') {
    return;
  }
  root.dataset.sheet = '1';

  const status = document.querySelector('#call-memory-status');
  const spherePane = document.querySelector('#call-sheet-sphere');
  const tracePane = document.querySelector('#call-sheet-trace');
  const sphereTab = document.querySelector('#call-sheet-tab-sphere');
  const traceTab = document.querySelector('#call-sheet-tab-trace');
  const handle = document.querySelector('#call-sheet-handle');
  let parked = false;
  let thinkHidden = think.hidden;
  let drag = null;

  function park() {
    const mobile = mobileQuery().matches;
    if (mobile && !parked) {
      thinkHidden = think.hidden;
      think.hidden = false;
      spherePane.append(view);
      if (status) spherePane.append(status);
      tracePane.append(think);
      parked = true;
      return;
    }
    if (!mobile && parked) {
      close();
      memory.append(view);
      if (status) memory.append(status);
      log.before(think);
      think.hidden = thinkHidden;
      parked = false;
    }
  }

  function showTab(tab) {
    const sphere = tab !== 'trace';
    spherePane.hidden = !sphere;
    tracePane.hidden = sphere;
    sphereTab.setAttribute('aria-selected', sphere ? 'true' : 'false');
    traceTab.setAttribute('aria-selected', sphere ? 'false' : 'true');
  }

  function open(tab) {
    if (!mobileQuery().matches) return;
    park();
    showTab(tab === 'trace' ? 'trace' : 'sphere');
    sheet.hidden = false;
    panel.style.setProperty('--sheet-drag', '0px');
    if (!panel.style.getPropertyValue('--sheet-h')) {
      panel.style.setProperty('--sheet-h', '62dvh');
    }
    (tab === 'trace' ? traceTab : sphereTab).focus();
  }

  function close() {
    sheet.hidden = true;
    panel.style.setProperty('--sheet-drag', '0px');
  }

  root.addEventListener('call-sheet', (event) => {
    open(event.detail?.tab);
  });
  sheet.querySelector('[data-close]')?.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sheet.hidden) close();
  });
  sphereTab.addEventListener('click', () => showTab('sphere'));
  traceTab.addEventListener('click', () => showTab('trace'));

  handle.addEventListener('pointerdown', (event) => {
    if (sheet.hidden) return;
    drag = {
      id: event.pointerId,
      y: event.clientY,
      height: panel.getBoundingClientRect().height,
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const next = drag.height - (event.clientY - drag.y);
    const limit = Math.max(180, window.innerHeight - 48);
    panel.style.setProperty('--sheet-h', `${Math.min(limit, Math.max(160, next))}px`);
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const dy = event.clientY - drag.y;
    drag = null;
    if (dy > 140) close();
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  function syncViewport() {
    const viewport = window.visualViewport;
    if (!mobileQuery().matches || !viewport) {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--kb');
      return;
    }
    const keyboard = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
    root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
    root.style.setProperty('--vv-height', `${viewport.height}px`);
    root.style.setProperty('--kb', keyboard > 80 ? '0' : '1');
  }

  park();
  syncViewport();
  mobileQuery().addEventListener('change', () => {
    park();
    syncViewport();
  });
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  document.querySelector('#call-input')?.addEventListener('focus', () => {
    requestAnimationFrame(syncViewport);
  });
}
