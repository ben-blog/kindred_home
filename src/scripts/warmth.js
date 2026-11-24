const NOTE = '+1 warmth, applied at next tick';
const bound = new WeakSet();

export function bindWarmth(root) {
  if (!root) return;
  for (const control of root.querySelectorAll('[data-warmth]')) {
    if (bound.has(control)) continue;
    const button = control.querySelector('button');
    const note =
      control.querySelector('[data-warmth-note]') ??
      control.closest('[data-character]')?.querySelector('[data-warmth-note]');
    const target = control.dataset.warmth;
    if (!button || !note || !target) continue;
    bound.add(control);
    button.addEventListener('click', () => sendWarmth(button, note, target, control));
  }
}

export function rateNote(retryAfter) {
  const seconds = Number(retryAfter);
  const minutes =
    Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 10;
  return `already sent, try again in ${minutes} min`;
}

async function sendWarmth(button, note, target, control) {
  button.disabled = true;
  button.dataset.sending = 'true';
  const fail = control.dataset.noteFail || 'Warmth did not send.';
  let message = fail;
  let wait = 0;
  let outcome = 'failed';
  try {
    const where = globalThis.location.pathname;
    const body = { target, amount: 1 };
    if (/^\/[A-Za-z0-9/_-]{0,120}$/.test(where)) body.where = where;
    const response = await globalThis.fetch('/api/world/signal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      outcome = 'sent';
      message = control.dataset.noteSent || NOTE;
      control.dispatchEvent(new CustomEvent('warmth:sent', { bubbles: true }));
    } else if (response.status === 429) {
      outcome = 'waiting';
      message = warmthWaitNote(response.headers.get('retry-after'), control.dataset.noteWait);
      if (control.dataset.noteWait) {
        const seconds = Number(response.headers.get('retry-after'));
        wait = Number.isFinite(seconds) && seconds > 0 ? seconds : 600;
      }
    }
  } catch {
    message = fail;
  }
  note.dataset.outcome = outcome;
  if (outcome === 'failed' && control.dataset.noteFail)
    control.dispatchEvent(new CustomEvent('warmth:failed', { bubbles: true }));
  note.textContent = message;
  note.hidden = false;
  note.classList.add('is-on');
  delete button.dataset.sending;
  if (wait) {
    const label = button.textContent;
    button.dataset.waitUntil = String(Date.now() + wait * 1000);
    const update = () => {
      const seconds = (Number(button.dataset.waitUntil) - Date.now()) / 1000;
      if (seconds <= 0) {
        delete button.dataset.waitUntil;
        button.disabled = false;
        button.textContent = label;
      } else {
        button.textContent = warmthWaitNote(seconds, control.dataset.noteWait);
        setTimeout(update, Math.min(seconds * 1000, 60000));
      }
    };
    update();
  } else button.disabled = false;
}

export function warmthWaitNote(retryAfter, template) {
  if (!template) return rateNote(retryAfter);
  const seconds = Number(retryAfter);
  const minutes =
    Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 10;
  return template.replace('{minutes}', String(minutes));
}
