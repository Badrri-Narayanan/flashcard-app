import { describe, expect, it } from 'vitest';
import { ACCENTS } from '../../src/ui/settings/applySettings';

type Rgb = [number, number, number];
const rgb = (triplet: string): Rgb => triplet.split(' ').map(Number) as Rgb;

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const SLATE_950: Rgb = [2, 6, 23];
const AA = 4.5;

describe('accent colours meet WCAG AA for text', () => {
  it.each(Object.entries(ACCENTS))('%s', (_name, [a50, a500, a600, a700]) => {
    // Primary buttons: white text on accent-600, and on accent-700 when hovered.
    expect(contrast(WHITE, rgb(a600))).toBeGreaterThanOrEqual(AA);
    expect(contrast(WHITE, rgb(a700))).toBeGreaterThanOrEqual(AA);
    // text-accent-600 on white and on the active nav item's accent-50 background.
    expect(contrast(rgb(a600), rgb(a50))).toBeGreaterThanOrEqual(AA);
    // dark:text-accent-500 on the dark page background.
    expect(contrast(rgb(a500), SLATE_950)).toBeGreaterThanOrEqual(AA);
  });
});
