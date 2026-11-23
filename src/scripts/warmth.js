const NOTE = '+1 warmth, applied at next tick';
const bound = new WeakSet();

export function bindWarmth(root) {
  if (!root) return;
  for (const control of root.querySelectorAll('[data-warmth]')) {
    if (bound.has(control)) continue;
    const button = control.querySelector('button');
    const note = control.querySelector('[data-warmth-note]');
    const target = control.dataset.warmth;
    if (!button || !note || !target) continue;
    bound.add(control);
    button.addEventListener('click', () => sendWarmth(button, note, target));
  }
}

export function rateNote(retryAfter) {
  const seconds = Number(retryAfter);
  const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 10;
  return `already sent, try again in ${minutes} min`;
}

async function sendWarmth(button, note, target) {
  button.disabled = true;
  let message = 'Warmth did not send.';
  try {
    const where = globalThis.location.pathname;
    const body = { target, amount: 1 };
    if (/^\/[A-Za-z0-9/_-]{0,120}$/.test(where)) body.where = where;
    const response = await globalThis.fetch('/api/world/signal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) message = NOTE;
    else if (response.status === 429) message = rateNote(response.headers.get('retry-after'));
  } catch {
    message = 'Warmth did not send.';
  }
  note.textContent = message;
  note.hidden = false;
  note.classList.add('is-on');
  button.disabled = false;
}
