/**
 * Headless check for the leader call composer.
 * Start the site first: npm run dev -- --host 127.0.0.1 --port 4321
 * Then: node scripts/check-call-chat.js
 */
/* global window, document, getComputedStyle, KeyboardEvent */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.CALL_CHAT_URL || 'http://127.0.0.1:4321';
const shotDir = '/opt/cursor/artifacts/chat-after';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

await page.evaluateOnNewDocument(() => {
  const orig = window.fetch.bind(window);
  window.__chat = { requests: [], streams: [], script: [] };
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    if (url.includes('/api/world/auth/session')) {
      return new Response(JSON.stringify({ signedIn: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/memory')) {
      return new Response(
        JSON.stringify({ basisVersion: '0', basisFingerprint: 'test', points: [] }),
        { headers: { 'content-type': 'application/json' } }
      );
    }
    const path = url.split('?')[0];
    if (method === 'POST' && /\/api\/world\/chat\/[^/]+$/.test(path)) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      window.__chat.requests.push(body);
      const scripted = window.__chat.script.shift();
      if (scripted?.error) throw new TypeError('Failed to fetch');
      if (scripted?.status && scripted.status !== 200) {
        return new Response(JSON.stringify({ error: 'too many requests' }), {
          status: scripted.status,
          headers: scripted.headers || {},
        });
      }
      let controller;
      const stream = new ReadableStream({
        start(control) {
          controller = control;
        },
      });
      window.__chat.streams.push({
        push(bytes) {
          controller.enqueue(bytes);
        },
        close() {
          controller.close();
        },
        fail() {
          controller.error(new Error('broken'));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return orig(input, init);
  };
});

async function open(slug, viewport) {
  await page.setViewport(viewport);
  await page.goto(`${base}/world/chat/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.querySelector('.call')?.dataset.mounted === '1' &&
      document.activeElement === document.querySelector('#call-input')
  );
}

async function send(text) {
  await page.evaluate((value) => {
    const input = document.querySelector('#call-input');
    const form = document.querySelector('#call-form');
    input.focus();
    input.value = value;
    form.requestSubmit();
  }, text);
}

function tokenFrame(text) {
  return `data: ${JSON.stringify({ type: 'token', text })}\n\n`;
}

function doneFrame() {
  return `data: ${JSON.stringify({ type: 'done', expression: 'calm', sessionId: 'sess-1' })}\n\n`;
}

async function pushText(index, text) {
  await page.evaluate(
    (i, payload) => {
      window.__chat.streams[i].push(new TextEncoder().encode(payload));
    },
    index,
    text
  );
}

async function youTexts() {
  return page.$$eval('.call-line.is-you p', (nodes) => nodes.map((node) => node.textContent));
}

async function queuedTexts() {
  return page.$$eval('.call-line.is-you.is-queued p', (nodes) =>
    nodes.map((node) => node.textContent)
  );
}

const desktop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };

await open('kin', desktop);

const font = await page.$eval('#call-input', (el) => getComputedStyle(el).fontFamily);
for (const face of ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji']) {
  assert.ok(font.includes(face), `input font missing ${face}: ${font}`);
}

await send('hello');
await page.waitForFunction(() => window.__chat.requests.length === 1);
assert.equal(await page.$eval('#call-input', (el) => el.disabled || el.readOnly), false);
await pushText(0, tokenFrame('Hi'));
await page.waitForFunction(() => {
  const node = [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1);
  return node && node.textContent.includes('Hi');
});

await send('one');
await send('two');
await send('three');

const mid = await page.evaluate(() => ({
  you: [...document.querySelectorAll('.call-line.is-you p')].map((node) => node.textContent),
  queued: [...document.querySelectorAll('.call-line.is-you.is-queued p')].map(
    (node) => node.textContent
  ),
  requests: window.__chat.requests.length,
  turns: document.querySelectorAll('#call-think .call-turn').length,
  disabled: document.querySelector('#call-input').disabled,
}));
assert.deepEqual(mid.you, ['hello', 'one', 'two', 'three']);
assert.deepEqual(mid.queued, ['one', 'two', 'three']);
assert.equal(mid.requests, 1);
assert.equal(mid.turns, 1);
assert.equal(mid.disabled, false);
await page.screenshot({ path: `${shotDir}/kin-desktop-queued.png` });

await page.click('#call-search');
await pushText(0, doneFrame());
await page.evaluate(() => window.__chat.streams[0].close());
await page.waitForFunction(() => window.__chat.requests.length === 2);
await new Promise((resolve) => setTimeout(resolve, 300));

const sent = await page.evaluate(() => window.__chat.requests);
assert.equal(sent.length, 2);
assert.equal(sent[0].forceWebSearch, undefined);
assert.equal(sent[1].forceWebSearch, true);
assert.equal(sent[1].sessionId, 'sess-1');
const users = sent[1].messages
  .filter((message) => message.role === 'user')
  .map((message) => message.content);
assert.deepEqual(users, ['hello', 'one\ntwo\nthree']);
assert.deepEqual(await youTexts(), ['hello', 'one', 'two', 'three']);
assert.deepEqual(await queuedTexts(), []);
assert.equal(await page.$eval('#call-search', (el) => el.getAttribute('aria-pressed')), 'false');
assert.equal(await page.$$eval('#call-think .call-turn', (nodes) => nodes.length), 2);
await pushText(1, tokenFrame('Together.'));
await pushText(1, doneFrame());
await page.evaluate(() => window.__chat.streams[1].close());
await page.waitForFunction(
  () => !document.querySelector('.call-stage').classList.contains('is-talking')
);

const replyFont = await page.$eval(
  '.call-line:not(.is-you) p',
  (el) => getComputedStyle(el).fontFamily
);
for (const face of ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji']) {
  assert.ok(replyFont.includes(face), `reply font missing ${face}`);
}

const rapid = await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  const form = document.querySelector('#call-form');
  input.value = 'rapid';
  form.requestSubmit();
  const afterFirst = window.__chat.requests.length;
  form.requestSubmit();
  return {
    afterFirst,
    afterSecond: window.__chat.requests.length,
    bubbles: [...document.querySelectorAll('.call-line.is-you p')].filter(
      (node) => node.textContent === 'rapid'
    ).length,
  };
});
assert.equal(rapid.afterFirst, 3);
assert.equal(rapid.afterSecond, 3);
assert.equal(rapid.bubbles, 1);
await pushText(2, tokenFrame('ok'));
await pushText(2, doneFrame());
await page.evaluate(() => window.__chat.streams[2].close());
await page.waitForFunction(
  () => !document.querySelector('.call-stage').classList.contains('is-talking')
);

const beforeEnter = await page.evaluate(() => window.__chat.requests.length);
await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  input.focus();
  input.value = 'again';
  const fire = () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      })
    );
  };
  fire();
  fire();
});
await page.waitForFunction((count) => window.__chat.requests.length === count, {}, beforeEnter + 1);
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(await page.evaluate(() => window.__chat.requests.length), beforeEnter + 1);
assert.equal((await youTexts()).filter((text) => text === 'again').length, 1);

await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  input.focus();
  input.value = '안녕';
  input.dispatchEvent(new Event('compositionstart'));
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  event.key = 'Enter';
  event.keyCode = 229;
  event.isComposing = true;
  input.dispatchEvent(event);
});
assert.equal(await page.$eval('#call-input', (el) => el.value), '안녕');
assert.equal(await page.evaluate(() => window.__chat.requests.length), 4);
await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  input.value = '완료';
  input.dispatchEvent(new Event('compositionend'));
});
assert.equal(await page.$eval('#call-input', (el) => el.value), '완료');

await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  event.key = 'Enter';
  event.keyCode = 13;
  event.isComposing = false;
  input.dispatchEvent(event);
  input.value = '료';
  input.dispatchEvent(new Event('compositionend'));
});
await page.evaluate(() => Promise.resolve());
assert.equal(await page.$eval('#call-input', (el) => el.value), '');
assert.equal((await youTexts()).includes('료'), false);
assert.equal((await youTexts()).filter((text) => text === '완료').length, 1);

await open('kin', desktop);
await page.evaluate(() => {
  window.__chat.script.push({ status: 429, headers: { 'retry-after': '1' } });
});
await send('hold me');
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.deepEqual(await youTexts(), ['hold me']);
assert.equal(await page.$eval('#call-status', (el) => el.textContent), 'Wait.');
await send('also');
assert.deepEqual(await queuedTexts(), ['hold me', 'also']);
assert.equal(await page.evaluate(() => window.__chat.requests.length), 1);
await page.click('.call-retry');
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(await page.evaluate(() => window.__chat.requests.length), 1);
await page.waitForFunction(() => window.__chat.requests.length === 2, { timeout: 4000 });
const retried = await page.evaluate(() => window.__chat.requests[1].messages.at(-1).content);
assert.equal(retried, 'hold me\nalso');

await open('kin', desktop);
await page.evaluate(() => {
  window.__chat.script.push({ error: true });
});
await send('keep me');
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.deepEqual(await youTexts(), ['keep me']);
assert.equal(await page.evaluate(() => window.__chat.requests.length), 1);
assert.equal(await page.$eval('#call-status', (el) => el.textContent), 'The line dropped.');
await page.click('.call-retry');
await page.waitForFunction(() => window.__chat.requests.length === 2);
assert.equal(
  await page.evaluate(() => window.__chat.requests[1].messages.at(-1).content),
  'keep me'
);
assert.deepEqual(await youTexts(), ['keep me']);

await open('kin', desktop);
await page.evaluate(() => {
  window.__chat.script.push({ status: 400 });
});
await send('nope');
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.equal(await page.$eval('#call-status', (el) => el.textContent), "That didn't send.");
await page.click('.call-retry');
await page.waitForFunction(() => window.__chat.requests.length === 2);
assert.equal(await page.evaluate(() => window.__chat.requests[1].messages.at(-1).content), 'nope');

await open('kin', desktop);
await page.evaluate(() => {
  window.__chat.script.push({ status: 502 });
});
await send('down');
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.equal(await page.$eval('#call-status', (el) => el.textContent), 'No answer came back.');

await open('kin', desktop);
await page.evaluate(() => {
  window.__chat.script.push({ status: 504 });
});
await send('slow');
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.equal(await page.$eval('#call-status', (el) => el.textContent), 'That took too long.');

await open('kin', desktop);
await send('stream');
await page.waitForFunction(() => window.__chat.streams.length === 1);
await pushText(0, 'data: {"type":"error","message":"unavailable"}\n\n');
await page.evaluate(() => window.__chat.streams[0].close());
await page.waitForFunction(() => document.querySelector('.call-retry'));
assert.equal(await page.$eval('#call-status', (el) => el.textContent), "They couldn't answer.");
await page.click('.call-retry');
await page.waitForFunction(() => window.__chat.requests.length === 2);
assert.equal(
  await page.evaluate(() => window.__chat.requests.at(-1).messages.at(-1).content),
  'stream'
);

await open('kin', desktop);
await send('');
assert.equal(await page.evaluate(() => window.__chat.requests.length), 0);
assert.equal(await page.$eval('#call-input', (el) => el.validationMessage), '');
assert.equal(await page.$eval('#call-input', (el) => el.required), false);

await open('kin', desktop);
await send('paint');
await page.waitForFunction(() => window.__chat.streams.length === 1);
await pushText(0, tokenFrame('Hi \uD83D'));
await page.waitForFunction(() => {
  const text =
    [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1)?.textContent || '';
  return text.startsWith('Hi');
});
const partial = await page.evaluate(() => {
  const text = [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1).textContent;
  let lone = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) lone = true;
    } else if (code >= 0xdc00 && code <= 0xdfff) lone = true;
  }
  return { text, lone, zwj: text.endsWith('\u200D') };
});
assert.equal(partial.lone, false);
assert.equal(partial.text, 'Hi ');
await pushText(0, tokenFrame('\uDE00'));
await page.waitForFunction(() => {
  const text =
    [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1)?.textContent || '';
  return text.includes('😀');
});

await pushText(0, tokenFrame('👨'));
await page.waitForFunction(() =>
  ([...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1)?.textContent || '').includes(
    '👨'
  )
);
await pushText(0, tokenFrame('\u200D'));
const joined = await page.evaluate(
  () => [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1).textContent
);
assert.equal(joined.endsWith('\u200D'), false);
assert.equal(joined.includes('👨'), false);
await pushText(0, tokenFrame('👩'));
await page.waitForFunction(() =>
  ([...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1)?.textContent || '').includes(
    '👩'
  )
);

await page.evaluate(() => {
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify({ type: 'token', text: '✨' })}\n\n`
  );
  const split = bytes.findIndex((byte, index) => byte === 0xf0 && bytes[index + 1] === 0x9f);
  const stream = window.__chat.streams[0];
  stream.push(bytes.slice(0, split + 1));
  window.__splitRest = bytes.slice(split + 1);
});
const broken = await page.evaluate(
  () => [...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1).textContent
);
assert.equal(broken.includes('\uFFFD'), false);
await page.evaluate(() => {
  window.__chat.streams[0].push(window.__splitRest);
});
await page.waitForFunction(() =>
  ([...document.querySelectorAll('.call-line:not(.is-you) p')].at(-1)?.textContent || '').includes(
    '✨'
  )
);

await open('kin', desktop);
await page.click('#call-emoji');
await page.waitForSelector('#call-emoji-panel:not([hidden])');
assert.equal(await page.$eval('#call-emoji', (el) => el.getAttribute('aria-expanded')), 'true');
await page.screenshot({ path: `${shotDir}/kin-desktop-picker.png` });
await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  input.focus();
  input.value = 'ac';
  input.setSelectionRange(1, 1);
});
await page.click('#call-emoji-panel [data-emoji="😊"]');
assert.equal(await page.$eval('#call-input', (el) => el.value), 'a😊c');
await page.keyboard.press('Escape');
assert.equal(await page.$eval('#call-emoji-panel', (el) => el.hidden), true);
await page.click('#call-emoji');
await page.waitForSelector('#call-emoji-panel:not([hidden])');
await page.mouse.click(30, 180);
assert.equal(await page.$eval('#call-emoji-panel', (el) => el.hidden), true);

await page.evaluate(() => {
  const input = document.querySelector('#call-input');
  input.focus();
  input.value = '안';
  input.dispatchEvent(new Event('compositionstart'));
  input.value = '안녕';
});
await page.click('#call-emoji');
await page.click('#call-emoji-panel [data-emoji="🌙"]');
assert.equal(await page.$eval('#call-input', (el) => el.value), '안녕');

await open('kin', mobile);
await page.click('#call-emoji');
await page.waitForSelector('#call-emoji-panel:not([hidden])');
await page.screenshot({ path: `${shotDir}/kin-mobile-picker.png` });

await open('dred', desktop);
await page.click('#call-emoji');
await page.waitForSelector('#call-emoji-panel:not([hidden])');
await page.screenshot({ path: `${shotDir}/dred-desktop-picker.png` });

await open('dred', mobile);
await page.screenshot({ path: `${shotDir}/dred-mobile.png` });
await page.click('#call-emoji');
await page.waitForSelector('#call-emoji-panel:not([hidden])');
await page.screenshot({ path: `${shotDir}/dred-mobile-picker.png` });

const serious = pageErrors.filter((error) => !/three|WebGL|memory/i.test(error));
assert.deepEqual(serious, []);

await browser.close();
console.log('call chat checks passed');
