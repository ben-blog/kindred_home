/** One sphere stays mounted while the surrounding panel changes modality. */
export function mountCallSheet() {
  const root = document.querySelector('.call');
  const sheet = document.querySelector('#call-sheet');
  const panel = document.querySelector('#call-sheet-panel');
  const toggle = document.querySelector('#call-memory-toggle');
  const column = document.querySelector('.call-column');
  const handle = document.querySelector('#call-sheet-handle');
  if (!root || !sheet || !panel || root.dataset.sheet === '1') return;
  root.dataset.sheet = '1';
  const query = window.matchMedia('(max-width: 800px)');
  let opened = false,
    keyboard = false,
    opener = null,
    drag = null;
  function close(restore = true) {
    const wasOpen = opened;
    opened = false;
    sheet.classList.remove('is-open');
    column.inert = false;
    toggle.setAttribute('aria-expanded', 'false');
    if (query.matches) sheet.inert = true;
    if (wasOpen && restore) opener?.focus({ preventScroll: true });
  }
  function layout() {
    close(false);
    sheet.inert = query.matches;
    panel.setAttribute('role', query.matches ? 'dialog' : 'region');
    if (query.matches) panel.setAttribute('aria-modal', 'true');
    else panel.removeAttribute('aria-modal');
  }
  toggle.addEventListener('click', () => {
    if (!query.matches) {
      panel.focus();
      return;
    }
    if (opened) {
      close();
      return;
    }
    if (document.querySelector('#call-viewer')?.open) return;
    if (keyboard) document.activeElement?.blur();
    opener = document.activeElement;
    opened = true;
    sheet.inert = false;
    sheet.classList.add('is-open');
    column.inert = true;
    toggle.setAttribute('aria-expanded', 'true');
    panel.focus({ preventScroll: true });
  });
  sheet
    .querySelectorAll('[data-close]')
    .forEach((el) => el.addEventListener('click', () => close()));
  document.addEventListener('keydown', (event) => {
    if (!opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const nodes = [...panel.querySelectorAll('button, a[href], summary, [tabindex="0"]')].filter(
      (el) => el.getClientRects().length
    );
    const first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === panel)
    ) {
      event.preventDefault();
      first?.focus();
    }
  });
  handle.addEventListener('pointerdown', (event) => {
    drag = {
      id: event.pointerId,
      y: event.clientY,
      height: panel.clientHeight,
      at: event.timeStamp,
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    panel.style.setProperty(
      '--sheet-h',
      `${Math.min(root.clientHeight, Math.max(160, drag.height - (event.clientY - drag.y)))}px`
    );
  });
  handle.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    if (dy > 140 || (dy > 50 && dy / Math.max(1, event.timeStamp - drag.at) > 0.5)) close();
    drag = null;
  });
  handle.addEventListener('pointercancel', () => {
    drag = null;
  });
  let maxHeight = window.innerHeight;
  function syncViewport() {
    const viewport = window.visualViewport;
    if (!query.matches) {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--kb');
      keyboard = false;
    } else {
      // Track the unoccluded size too: Android may resize innerHeight with the keyboard.
      if (document.activeElement?.id !== 'call-input')
        maxHeight = Math.max(window.innerHeight, viewport?.height || 0);
      const height = viewport?.height || window.innerHeight;
      const top = viewport?.offsetTop || 0;
      // Only an input with focus can raise the keyboard. Browser toolbars also shrink the
      // visual viewport, and that must not lock the memory toggle.
      keyboard =
        document.activeElement?.id === 'call-input' &&
        Math.max(maxHeight, window.innerHeight) - top - height > 80;
      root.style.setProperty('--vv-top', `${top}px`);
      root.style.setProperty('--vv-height', `${height}px`);
      root.style.setProperty('--kb', keyboard ? '0' : '1');
      if (keyboard) close(false);
    }
    root.dispatchEvent(new CustomEvent('call-viewport'));
  }
  layout();
  syncViewport();
  query.addEventListener('change', () => {
    layout();
    syncViewport();
  });
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', () => {
    maxHeight = window.innerHeight;
    syncViewport();
  });
  document
    .querySelector('#call-input')
    ?.addEventListener('focus', () => requestAnimationFrame(syncViewport));
}
