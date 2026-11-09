/**
 * The secret path is never written into the bundle: the catch-all route
 * hashes whatever path it gets and compares it with this number. The footer
 * riddle is the only way in.
 */
const GATE = 3607607011;

// 32-bit FNV-1a.
const fnv1a = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

export const isGate = (pathname: string) =>
  fnv1a(pathname.toLowerCase().replace(/\/+$/, "")) === GATE;
