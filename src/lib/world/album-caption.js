import { memoryEmotions } from '../../config/memory-emotions.js';
import { voiceCards, voiceFor } from './album-voice.js';

const EMOTIONS = new Set(memoryEmotions);
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MODEL = /^[A-Za-z0-9._:-]{1,80}$/;
const KEY = /^[\x21-\x7E]{20,4096}$/;
const ATTEMPT_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 1_500;
const RETRYABLE_HTTP = new Set([500, 502, 503, 529]);

export function albumModel(env) {
  const named = env?.ANTHROPIC_ALBUM_MODEL;
  if (named == null || named === '') return DEFAULT_MODEL;
  return MODEL.test(named) ? named : null;
}

export function anthropicKey(env) {
  const key = env?.ANTHROPIC_API_KEY;
  return typeof key === 'string' && KEY.test(key) ? key : '';
}

export function cleanCaption(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const style = line(value.style, 80);
  const ko = block(value.ko);
  const en = block(value.en);
  const tags = tagsOf(value.tags);
  const felt = feltOf(value.felt);
  if (!style || !ko || !en || !tags || !felt) return null;
  let showOnMain = false;
  if (value.show_on_main != null) {
    if (typeof value.show_on_main !== 'boolean') return null;
    showOnMain = value.show_on_main;
  }
  return { style, tags, ko, en, felt, show_on_main: showOnMain };
}

export function parseCaption(raw) {
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text
      .replace(/^```\w*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return cleanCaption(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export function captionFailure(status, raw) {
  const message = redact(errorMessage(raw));
  const type = errorType(raw);
  if (
    status === 402 ||
    /credit balance|billing|insufficient credit|payment required/i.test(message)
  ) {
    return {
      status: 402,
      error: 'credit',
      detail:
        'The caption model has no credit. Add credit to the Anthropic account for ANTHROPIC_API_KEY, then regenerate.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model rejected ANTHROPIC_API_KEY. Check the key, then regenerate.',
    };
  }
  if (status === 429) {
    return {
      status: 429,
      error: 'caption',
      detail: 'The caption model is rate limited. Wait a minute, then regenerate.',
    };
  }
  if (status === 529 || type === 'overloaded_error') {
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model is busy right now. Wait a minute, then regenerate.',
      retryable: true,
    };
  }
  if (status === 404 || /model/i.test(message)) {
    return {
      status: 502,
      error: 'caption',
      detail:
        'The caption model name was rejected. Set ANTHROPIC_ALBUM_MODEL to a vision model, then regenerate.',
    };
  }
  if (status === 400 || type === 'invalid_request_error') {
    return {
      status: 502,
      error: 'caption',
      detail: message
        ? `The caption request was rejected: ${message}`
        : 'The caption model did not answer. Regenerate.',
    };
  }
  if (RETRYABLE_HTTP.has(status)) {
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model did not answer. Regenerate.',
      retryable: true,
    };
  }
  return {
    status: 502,
    error: 'caption',
    detail: 'The caption model did not answer. Regenerate.',
  };
}

export function captionRequest({ model, character, note, imageBase64 }) {
  return {
    model,
    max_tokens: 2500,
    system: systemPrompt(character),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/webp', data: imageBase64 },
          },
          { type: 'text', text: userPrompt(note) },
        ],
      },
    ],
  };
}

export async function requestCaption({
  env,
  bytes,
  character,
  note,
  fetchImpl,
  sleep = wait,
}) {
  const key = anthropicKey(env);
  if (!key) {
    return { status: 503, error: 'caption', detail: 'ANTHROPIC_API_KEY is not set.' };
  }
  const model = albumModel(env);
  if (!model) {
    return {
      status: 503,
      error: 'caption',
      detail: 'ANTHROPIC_ALBUM_MODEL is not a usable model name.',
    };
  }
  if (!voiceFor(character.slug)) {
    return { status: 502, error: 'caption', detail: 'This character has no caption voice.' };
  }
  const imageBytes = byteSize(bytes);
  const body = JSON.stringify(
    captionRequest({
      model,
      character,
      note,
      imageBase64: Buffer.from(bytes).toString('base64'),
    })
  );
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const result = await attemptCaption({
      key,
      body,
      imageBytes,
      fetchImpl,
    });
    if (result.caption) return result;
    last = result;
    if (!result.retryable) break;
  }
  if (!last) {
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model did not answer. Regenerate.',
    };
  }
  return {
    status: last.status,
    error: last.error,
    detail: last.detail,
  };
}

async function attemptCaption({ key, body, imageBytes, fetchImpl }) {
  const started = Date.now();
  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch (error) {
    const failureCase = isTimeout(error) ? 'timeout' : 'network';
    logCaptionFailure({
      case: failureCase,
      status: null,
      errorType: null,
      message: error?.message || '',
      elapsedMs: Date.now() - started,
      imageBytes,
    });
    return {
      status: 502,
      error: 'caption',
      detail:
        failureCase === 'timeout'
          ? 'The caption model took too long. Regenerate.'
          : 'The caption model did not answer. Regenerate.',
      retryable: true,
    };
  }
  const raw = await response.text();
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    logCaptionFailure({
      case: 'http',
      status: response.status,
      errorType: errorType(raw),
      message: errorMessage(raw),
      elapsedMs,
      imageBytes,
    });
    return captionFailure(response.status, raw);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    logCaptionFailure({
      case: 'bad_json',
      status: response.status,
      errorType: null,
      message: '',
      elapsedMs,
      imageBytes,
    });
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model did not answer. Regenerate.',
    };
  }
  const text = Array.isArray(payload?.content)
    ? payload.content.find((block) => block?.type === 'text')?.text
    : '';
  const caption = parseCaption(text);
  if (!caption) {
    return {
      status: 502,
      error: 'caption',
      detail: 'The caption model returned text that does not fit the gallery. Regenerate.',
    };
  }
  return { caption };
}

function logCaptionFailure({ case: failureCase, status, errorType, message, elapsedMs, imageBytes }) {
  console.error(
    JSON.stringify({
      scope: 'album-caption',
      case: failureCase,
      status,
      errorType,
      message: redact(message),
      elapsedMs,
      imageBytes,
    })
  );
}

function systemPrompt(character) {
  const speaker = voiceFor(character.slug);
  const cards = voiceCards()
    .map((voice) => `${voice.slug}: ${voice.tone} Sample: ${voice.sample}`)
    .join('\n');
  return [
    `You are ${speaker ? character.slug : 'the character'} writing a kinxdred gallery entry for a picture Ben made.`,
    `Your voice is ${character.slug}. ${speaker.tone}`,
    `A line you would actually say: ${speaker.sample}`,
    'Other voices, for their perspective fields only:',
    cards,
    'Return one JSON object and nothing else. Keys:',
    'style (short house label, like "G — Risograph Print"),',
    'tags (2 to 6 objects with name_ko and name_en),',
    'ko and en, each with title, technique, description, kin_perspective, dred_perspective,',
    'felt: { summary, emotion: { label, intensity, reason } }.',
    `emotion.label is one of ${memoryEmotions.join(', ')}. intensity is a number from 0 to 1.`,
    'felt.summary is Korean, first person, one paragraph: what you did, the place, the outfit, and the mood. This paragraph is the memory.',
    'kin_perspective is KIN. dred_perspective is DRED. Each stays in that voice and stays short.',
    'technique names how the picture is made. description is what is in the frame. Do not mention being a model.',
  ].join('\n');
}

function userPrompt(note) {
  const extra =
    typeof note === 'string' && note.trim()
      ? `Ben left this note. Use it as context, do not paste it: ${note.trim()}`
      : 'Ben left no note.';
  return `${extra}\nLook at the picture and write the JSON.`;
}

function block(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = line(value.title, 80);
  const technique = line(value.technique, 500);
  const description = line(value.description, 800);
  const kin = line(value.kin_perspective, 400);
  const dred = line(value.dred_perspective, 400);
  if (!title || !technique || !description || !kin || !dred) return null;
  return {
    title,
    technique,
    description,
    kin_perspective: kin,
    dred_perspective: dred,
  };
}

function tagsOf(value) {
  if (!Array.isArray(value)) return null;
  const tags = [];
  const seen = new Set();
  for (const tag of value) {
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return null;
    const nameKo = line(tag.name_ko, 40);
    const nameEn = line(tag.name_en || tag.name_ko, 40);
    if (!nameKo || !nameEn) return null;
    const key = nameKo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push({ name_ko: nameKo, name_en: nameEn });
  }
  if (tags.length < 2 || tags.length > 8) return null;
  return tags;
}

function feltOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const summary = line(value.summary, 600);
  if (!summary || !value.emotion || typeof value.emotion !== 'object') return null;
  const label =
    typeof value.emotion.label === 'string' ? value.emotion.label.trim().toLowerCase() : '';
  if (!EMOTIONS.has(label)) return null;
  const intensity = Number(value.emotion.intensity);
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) return null;
  const reason = clip(value.emotion.reason, 180);
  if (reason == null) return null;
  return {
    summary,
    emotion: { label, intensity: Math.round(intensity * 100) / 100, reason },
  };
}

function line(value, max) {
  const text = clip(value, max);
  return text ? text : '';
}

function clip(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    out += code < 32 ? ' ' : char;
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > max) return '';
  return out;
}

function errorMessage(raw) {
  try {
    const body = JSON.parse(raw);
    const message = body?.error?.message || body?.message;
    return typeof message === 'string' ? message : '';
  } catch {
    return '';
  }
}

function errorType(raw) {
  try {
    const body = JSON.parse(raw);
    const type = body?.error?.type;
    return typeof type === 'string' ? type.slice(0, 80) : null;
  } catch {
    return null;
  }
}

function redact(text) {
  return String(text || '')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 180);
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function byteSize(bytes) {
  if (!bytes) return 0;
  if (typeof bytes.byteLength === 'number') return bytes.byteLength;
  if (typeof bytes.length === 'number') return bytes.length;
  return 0;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
