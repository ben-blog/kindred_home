import assert from 'node:assert/strict';
import test from 'node:test';
import { attachImeEnterGuard, createImeEnterGuard, shouldSubmitOnEnter } from './ime-enter.js';

const plainEnter = () => ({
  key: 'Enter',
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  preventDefault() {
    this.defaultPrevented = true;
  },
});

test('Enter submits and Shift+Enter does not', () => {
  assert.equal(shouldSubmitOnEnter(plainEnter()), true);
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', shiftKey: true, keyCode: 13 }), false);
  assert.equal(shouldSubmitOnEnter({ key: 'a', keyCode: 65 }), false);
});

test('Enter is ignored while an IME composition is active', () => {
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', isComposing: true, keyCode: 13 }), false);
  assert.equal(
    shouldSubmitOnEnter({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: true } }),
    false
  );
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', isComposing: false, keyCode: 229 }), false);
  assert.equal(shouldSubmitOnEnter(plainEnter(), true), false);
});

test('confirming a syllable does not send, and the next Enter does', () => {
  const input = { value: '안녕' };
  const sent = [];
  const guard = createImeEnterGuard(input, () => {
    sent.push(input.value);
    input.value = '';
  });

  guard.onCompositionStart();
  input.value = '완료';
  assert.equal(
    guard.onKeyDown({ key: 'Enter', isComposing: true, keyCode: 229, preventDefault() {} }),
    false
  );
  assert.deepEqual(sent, []);
  assert.equal(guard.onCompositionEnd(), false);
  assert.equal(input.value, '완료');

  const send = plainEnter();
  assert.equal(guard.onKeyDown(send), true);
  assert.equal(send.defaultPrevented, true);
  assert.deepEqual(sent, ['완료']);
  assert.equal(input.value, '');
});

test('Shift+Enter does not submit', () => {
  const input = { value: '완료' };
  let sent = 0;
  const guard = createImeEnterGuard(input, () => {
    sent += 1;
  });
  const event = plainEnter();
  event.shiftKey = true;
  assert.equal(guard.onKeyDown(event), false);
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(sent, 0);
  assert.equal(input.value, '완료');
});

test('a syllable written back after send is removed', async () => {
  const input = { value: '완료' };
  const guard = createImeEnterGuard(input, () => {
    input.value = '';
  });
  assert.equal(guard.onKeyDown(plainEnter()), true);
  assert.equal(input.value, '');

  input.value = '료';
  assert.equal(guard.onCompositionEnd(), true);
  assert.equal(input.value, '');

  input.value = '료';
  await Promise.resolve();
  assert.equal(input.value, '');
});

test('the next composition after a send is kept', async () => {
  const input = { value: 'hello' };
  const guard = createImeEnterGuard(input, () => {
    input.value = '';
  });
  guard.onKeyDown(plainEnter());
  guard.onCompositionStart();
  input.value = '안';
  assert.equal(guard.onCompositionEnd(), false);
  await Promise.resolve();
  assert.equal(input.value, '안');
});

test('a submit during composition does not go through', () => {
  const input = { value: '료' };
  let sent = 0;
  const guard = createImeEnterGuard(input, () => {
    sent += 1;
    input.value = '';
  });
  guard.onCompositionStart();
  const event = {
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
  };
  assert.equal(guard.onSubmitCapture(event), true);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(sent, 0);
  assert.equal(guard.onCompositionEnd(), false);
  assert.equal(input.value, '료');
  assert.equal(
    guard.onSubmitCapture({ preventDefault() {}, stopImmediatePropagation() {} }),
    false
  );
});

test('the chat field ignores a composing Enter and submits the next one', async () => {
  const input = new EventTarget();
  input.value = '안녕';
  const form = new EventTarget();
  const sent = [];
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sent.push(input.value);
    input.value = '';
  });
  form.requestSubmit = () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  attachImeEnterGuard(input, form);

  const keydown = (init) => {
    const event = new Event('keydown', { cancelable: true });
    event.key = init.key;
    event.shiftKey = Boolean(init.shiftKey);
    event.isComposing = Boolean(init.isComposing);
    event.keyCode = init.keyCode;
    event.nativeEvent = init.nativeEvent;
    return event;
  };

  input.dispatchEvent(new Event('compositionstart'));
  const composing = keydown({ key: 'Enter', isComposing: true, keyCode: 229 });
  input.dispatchEvent(composing);
  assert.equal(composing.defaultPrevented, false);
  assert.deepEqual(sent, []);

  input.value = '완료';
  input.dispatchEvent(new Event('compositionend'));
  assert.equal(input.value, '완료');

  const send = keydown({ key: 'Enter', keyCode: 13 });
  input.dispatchEvent(send);
  assert.equal(send.defaultPrevented, true);
  assert.deepEqual(sent, ['완료']);
  assert.equal(input.value, '');

  input.value = '료';
  input.dispatchEvent(new Event('compositionend'));
  await Promise.resolve();
  assert.equal(input.value, '');
});

test('document capture blocks a submit while a composition is open', () => {
  const input = new EventTarget();
  input.value = '료';
  const form = new EventTarget();
  let capture;
  const root = {
    addEventListener(type, fn, useCapture) {
      assert.equal(type, 'submit');
      assert.equal(useCapture, true);
      capture = fn;
    },
  };
  input.ownerDocument = root;
  attachImeEnterGuard(input, form);

  const eventFor = (target) => ({
    target,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
  });

  input.dispatchEvent(new Event('compositionstart'));
  const blocked = eventFor(form);
  capture(blocked);
  assert.equal(blocked.defaultPrevented, true);
  assert.equal(blocked.stopped, true);
  assert.equal(input.value, '료');

  const other = eventFor({});
  capture(other);
  assert.equal(other.defaultPrevented, undefined);

  input.dispatchEvent(new Event('compositionend'));
  const allowed = eventFor(form);
  capture(allowed);
  assert.equal(allowed.defaultPrevented, undefined);
  assert.equal(allowed.stopped, undefined);
});
