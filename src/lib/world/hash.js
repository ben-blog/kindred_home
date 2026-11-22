import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Salted hash of a visitor address. The raw address is not stored. */
export function hashIp(ip, salt) {
  return createHmac('sha256', salt).update(String(ip)).digest('hex');
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
