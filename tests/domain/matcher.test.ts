import { describe, expect, it } from 'vitest';
import { matchAnswer, normalizeAnswer, stripMarkdown } from '../../src/domain/matcher';

describe('normalizeAnswer', () => {
  it('lowercases, removes diacritics, punctuation and leading articles', () => {
    expect(normalizeAnswer('The Café!')).toBe('cafe');
    expect(normalizeAnswer('  An   Apple, please ')).toBe('apple please');
    expect(normalizeAnswer('a')).toBe('a');
  });

  it('strips markdown before comparing', () => {
    expect(normalizeAnswer('**The `cat`** and [a link](http://x.y) ![pic](media:1)')).toBe('cat and a link pic');
  });

  it('keeps non-latin letters intact', () => {
    expect(normalizeAnswer('がっこう')).toBe('がっこう');
  });
});

describe('stripMarkdown', () => {
  it('keeps the readable text', () => {
    expect(stripMarkdown('# Title\n- *one* and __two__\n> quote')).toBe('Title one and two quote');
  });
});

describe('matchAnswer', () => {
  it('The Café vs cafe is exact', () => {
    expect(matchAnswer('The Café', 'cafe').verdict).toBe('exact');
  });

  it('recieve vs receive is close', () => {
    expect(matchAnswer('recieve', 'receive').verdict).toBe('close');
  });

  it('cat vs dog is wrong', () => {
    expect(matchAnswer('cat', 'dog').verdict).toBe('wrong');
  });

  it('accepts any slash-separated alternative', () => {
    expect(matchAnswer('colour', 'color / colour').verdict).toBe('exact');
    expect(matchAnswer('color', 'color / colour').verdict).toBe('exact');
    expect(matchAnswer('colur', 'color / colour').verdict).toBe('close');
  });

  it('matches against markdown targets', () => {
    expect(matchAnswer('mitochondria', '**Mitochondria**').verdict).toBe('exact');
  });

  it('empty input is wrong, even against an empty-looking target', () => {
    expect(matchAnswer('', 'cat').verdict).toBe('wrong');
    expect(matchAnswer('   ', 'cat').verdict).toBe('wrong');
    expect(matchAnswer('!!', '??').verdict).toBe('wrong');
  });

  it('returns a char-level diff from the typed answer to the target', () => {
    const { diff } = matchAnswer('recieve', 'receive');
    expect(diff.map((d) => d.text).join('')).toContain('rec');
    expect(diff.some((d) => d.op === 'del')).toBe(true);
    expect(diff.some((d) => d.op === 'ins')).toBe(true);
    expect(diff.filter((d) => d.op !== 'ins').map((d) => d.text).join('')).toBe('recieve');
    expect(diff.filter((d) => d.op !== 'del').map((d) => d.text).join('')).toBe('receive');
  });

  it('exact diff is a single equal run', () => {
    expect(matchAnswer('cafe', 'Café').diff).toEqual([{ text: 'cafe', op: 'eq' }]);
  });
});
