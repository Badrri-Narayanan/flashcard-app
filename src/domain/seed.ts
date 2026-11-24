import { mulberry32 } from './queue';

/** FNV-1a 32-bit hash of a string. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic random source derived from a string, so the same seed always replays the same sequence. */
export function seededRng(seed: string): () => number {
  return mulberry32(hashString(seed));
}
