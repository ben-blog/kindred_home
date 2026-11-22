/**
 * Enter submits a world text field. Shift+Enter does not.
 *
 * Korean IME confirms the current syllable on Enter while composition is
 * still active (`isComposing`, or keyCode 229). Submitting on that keydown
 * clears the field, then `compositionend` writes the syllable back.
 */

export function isImeEnter(event, composing = false) {
  if (composing) return true;
  if (!event) return false;
  if (event.isComposing) return true;
  if (event.nativeEvent?.isComposing) return true;
  return event.keyCode === 229;
}

export function shouldSubmitOnEnter(event, composing = false) {
  if (!event || event.key !== 'Enter' || event.shiftKey) return false;
  return !isImeEnter(event, composing);
}

/**
 * @param {{ value: string }} input
 * @param {() => void} requestSubmit
 */
export function createImeEnterGuard(input, requestSubmit) {
  let composing = false;
  let dropCommit = false;
  let wipeGeneration = 0;

  const wipe = (generation) => {
    if (generation !== wipeGeneration) return;
    input.value = '';
  };

  return {
    onCompositionStart() {
      composing = true;
      dropCommit = false;
      wipeGeneration += 1;
    },

    onCompositionEnd() {
      composing = false;
      if (!dropCommit) return false;
      dropCommit = false;
      const generation = wipeGeneration;
      wipe(generation);
      // Some engines insert the committed syllable after this listener returns.
      queueMicrotask(() => wipe(generation));
      return true;
    },

    onKeyDown(event) {
      if (!shouldSubmitOnEnter(event, composing)) return false;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const before = input.value;
      requestSubmit();
      // Armed only when the submit emptied the field. compositionend then
      // drops a syllable the IME writes back into that empty field.
      dropCommit = input.value !== before;
      return true;
    },

    onSubmitCapture(event) {
      if (!composing) return false;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      return true;
    },
  };
}

export function attachImeEnterGuard(input, form) {
  const guard = createImeEnterGuard(input, () => form.requestSubmit());
  input.addEventListener('compositionstart', () => {
    guard.onCompositionStart();
  });
  input.addEventListener('compositionend', () => {
    guard.onCompositionEnd();
  });
  input.addEventListener('keydown', (event) => {
    guard.onKeyDown(event);
  });
  // Capture on the document, not the form. Listeners on the form itself run
  // in registration order, and the page handler is already registered.
  const root = input.ownerDocument;
  if (root) {
    root.addEventListener(
      'submit',
      (event) => {
        if (event.target !== form) return;
        guard.onSubmitCapture(event);
      },
      true
    );
  }
  return guard;
}
