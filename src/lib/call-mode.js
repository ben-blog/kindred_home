import { clampHistory } from './chat-compose.js';

/** Visible labels stay short. Accessible names say which path the segment is. */
export const MODE_LABELS = {
  mode1: '모드 1',
  mode2: '모드 2',
  mode1Name: '모드 1, 일반',
  mode2Name: '모드 2, 성인',
  mode1Chip: '현재 모드 1, 일반',
  mode2Chip: '현재 모드 2, 성인',
  notice: '모드 2가 켜져 있어요',
};

export function adultModeStorageKey(slug) {
  return `call:${slug}:adultMode`;
}

/**
 * Mode 1 is the normal path. Mode 2 is the leader adult path.
 * `on` must be boolean true; any other value stays on mode 1.
 */
export function modeControlState(on, copy = {}) {
  const adult = on === true;
  const mode1 = copy.mode1 || MODE_LABELS.mode1;
  const mode2 = copy.mode2 || MODE_LABELS.mode2;
  return {
    mode1: { on: !adult, label: mode1, name: copy.mode1Name || MODE_LABELS.mode1Name },
    mode2: { on: adult, label: mode2, name: copy.mode2Name || MODE_LABELS.mode2Name },
    chip: {
      text: adult ? mode2 : mode1,
      name: adult
        ? copy.mode2Chip || MODE_LABELS.mode2Chip
        : copy.mode1Chip || MODE_LABELS.mode1Chip,
      on: adult,
    },
    presenceTint: adult,
    notice: adult ? copy.mode2Notice || MODE_LABELS.notice : '',
    leaderAdultMode: adult,
  };
}

function paintSegment(node, segment) {
  if (!node) return;
  node.textContent = segment.label;
  node.classList.toggle('is-on', segment.on);
  node.setAttribute('aria-pressed', segment.on ? 'true' : 'false');
  node.setAttribute('aria-checked', segment.on ? 'true' : 'false');
  node.tabIndex = segment.on ? 0 : -1;
  if (segment.name) node.setAttribute('aria-label', segment.name);
}

/** Selected segment and the header chip share one `is-on` class. */
export function applyModeState(nodes, on, copy) {
  const state = modeControlState(on, copy);
  paintSegment(nodes.mode1, state.mode1);
  paintSegment(nodes.mode2, state.mode2);
  if (nodes.chip) {
    nodes.chip.textContent = state.chip.text;
    nodes.chip.classList.toggle('is-on', state.chip.on);
    nodes.chip.setAttribute('aria-label', state.chip.name);
  }
  nodes.root?.classList.toggle('is-mode-2', state.presenceTint);
  return state;
}

/** Client gate. The server still requires the leader and drops every other slug. */
export function leaderAdultFlag(slug, modeOn) {
  return slug === 'dred' && modeOn === true;
}

export function buildChatPayload({
  slug,
  modeOn = false,
  messages,
  sessionId = '',
  continuation = false,
  quote,
  plan,
  forceWebSearch = false,
} = {}) {
  const payload = { messages: clampHistory(messages) };
  if (continuation) payload.continue = true;
  if (leaderAdultFlag(slug, modeOn)) payload.leaderAdultMode = true;
  if (quote && typeof quote.id === 'string' && typeof quote.excerpt === 'string') {
    payload.reply_to = { id: quote.id, excerpt: quote.excerpt };
  }
  if (sessionId) payload.sessionId = sessionId;
  if (plan) payload.plan = plan;
  if (!continuation && forceWebSearch) payload.forceWebSearch = true;
  return payload;
}
