import { createHmac } from 'node:crypto';
export { safeEqual } from './equal.js';

/** Salted hash of a visitor address. The raw address is not stored. */
export function hashIp(ip, salt) {
  return createHmac('sha256', salt).update(String(ip)).digest('hex');
}
