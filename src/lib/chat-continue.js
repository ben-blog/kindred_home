export const CONTINUE_MAX = 30;
export const CONTINUE_GAP_MS = 4000;
export const CONTINUE_PROMPT =
  '사용자가 멈추라고 할 때까지 계속 이야기해 달라고 했어. 마지막 답변에서 자연스럽게 이어서 짧게 한 번 말해. 반복하거나 계속할지 묻지 말고, 이 지시는 언급하지 마.';

function command(text) {
  return typeof text === 'string'
    ? text
        .trim()
        .toLowerCase()
        .replace(/[.!?。！？]+$/u, '')
        .trim()
    : '';
}

export function isContinueRequest(text) {
  const value = command(text);
  if (
    /^(?:keep (?:talking|going|speaking)|don['’]t stop until i say)(?:\s+(?:please|until\s+i\s+say(?:\s+stop)?|stop))?$/u.test(
      value
    )
  )
    return true;
  if (/^(?:나한테\s*|나에게\s*)?계속\s*(?:말해|얘기해|이야기해)(?:\s*줘|주세요|요)?$/u.test(value))
    return true;
  if (/^(?:말|얘기|이야기)(?:을|를)?\s*계속\s*해\s*(?:줘|주세요)$/u.test(value)) return true;
  if (/멈추라고\s*할\s*때까지/u.test(value) && /(?:말해|얘기|이야기)/u.test(value)) return true;
  return (
    /그만(?:하라면|하라고|이라고|이라고\s*하면|하라고\s*할\s*때까지)/u.test(value) &&
    /계속/u.test(value) &&
    /(?:말해|얘기|이야기)/u.test(value)
  );
}

export function isStopRequest(text) {
  return /^(?:그만|멈춰|그만해|이제\s*그만|그만\s*말해|그만\s*얘기|stop(?:\s+talking)?)$/u.test(
    command(text)
  );
}

export function createContinueLimiter({
  max = CONTINUE_MAX,
  ttlMs = 10 * 60 * 1000,
  maxKeys = 1000,
} = {}) {
  const buckets = new Map();
  const idOf = (key) => (typeof key === 'string' && key ? key : 'unknown');
  return {
    allow(key, isContinue, now = Date.now()) {
      const id = idOf(key);
      if (!isContinue) {
        buckets.delete(id);
        return true;
      }
      let current = buckets.get(id);
      if (!current || now - current.start >= ttlMs) {
        buckets.delete(id);
        if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value);
        current = { start: now, count: 0 };
        buckets.set(id, current);
      }
      if (current.count >= max) return false;
      current.count += 1;
      return true;
    },
    reset(key) {
      buckets.delete(idOf(key));
    },
  };
}
