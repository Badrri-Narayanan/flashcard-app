import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { decompressUriCapped } from '../../src/domain/lzDecompress';

const samples = [
  'a',
  'hello hello hello hello',
  JSON.stringify({ v: 1, deck: { name: 'Café 日本 🌍' }, cards: Array.from({ length: 50 }, (_, i) => ({ front: `q${i}`, back: 'answer '.repeat(i) })) }),
  Array.from({ length: 3000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 5000))).join(''),
];

describe('decompressUriCapped', () => {
  it.each(samples.map((s) => [s.slice(0, 20), s]))('matches lz-string for %s…', (_label, text) => {
    const encoded = compressToEncodedURIComponent(text);
    expect(decompressUriCapped(encoded, Infinity)).toBe(decompressFromEncodedURIComponent(encoded));
    expect(decompressUriCapped(encoded.replace(/\+/g, ' '), Infinity)).toBe(text);
  });

  it('agrees with lz-string on damaged input', () => {
    const encoded = compressToEncodedURIComponent(samples[2]);
    for (const bad of [encoded.slice(0, encoded.length / 2), '!!!not-a-share!!!', 'A', `${encoded}zz`]) {
      expect(decompressUriCapped(bad, Infinity)).toBe(decompressFromEncodedURIComponent(bad));
    }
  });

  it('gives up once the output would exceed the cap', () => {
    const bomb = compressToEncodedURIComponent('a'.repeat(200_000));
    expect(bomb.length).toBeLessThan(2_000);
    expect(decompressUriCapped(bomb, 199_999)).toBeNull();
    expect(decompressUriCapped(bomb, 200_000)).toBe('a'.repeat(200_000));
  });
});
