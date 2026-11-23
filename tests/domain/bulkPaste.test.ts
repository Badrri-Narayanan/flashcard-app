import { describe, expect, it } from 'vitest';
import { detectSeparators, parseBulk } from '../../src/domain/bulkPaste';

describe('detectSeparators', () => {
  it('detects tab', () => {
    expect(detectSeparators('a\tb\nc\td')).toEqual({ term: '\t', card: 'newline' });
  });

  it("detects ' - '", () => {
    expect(detectSeparators('a - b\nc - d')).toEqual({ term: ' - ', card: 'newline' });
  });

  it('prefers the separator present in the most lines, then priority on ties', () => {
    expect(detectSeparators('a: b\nc: d\ne - f').term).toBe(':');
    expect(detectSeparators('a\tb\nc - d').term).toBe('\t');
  });

  it("defaults to ' - ' when no candidate appears", () => {
    expect(detectSeparators('just words\nmore words').term).toBe(' - ');
  });

  it('detects blankline when blocks span multiple lines', () => {
    expect(detectSeparators('a - b\nmore\n\nc - d\neven more').card).toBe('blankline');
    expect(detectSeparators('a - b\n\nc - d').card).toBe('newline');
  });
});

describe('parseBulk', () => {
  it('splits on the first separator only', () => {
    const { drafts } = parseBulk('a - b - c', { term: ' - ', card: 'newline' });
    expect(drafts).toEqual([{ front: 'a', back: 'b - c' }]);
  });

  it('keeps multi-line backs in blankline mode', () => {
    const text = 'term1\nline one\nline two\n\nterm2\nanswer';
    const { drafts, skipped } = parseBulk(text, { term: ' - ', card: 'blankline' });
    expect(drafts).toEqual([
      { front: 'term1', back: 'line one\nline two' },
      { front: 'term2', back: 'answer' },
    ]);
    expect(skipped).toEqual([]);
  });

  it('splits a blankline block on the term separator when its first line has one', () => {
    const text = 'term1 - first\nsecond\n\nterm2 - x';
    const { drafts } = parseBulk(text, { term: ' - ', card: 'blankline' });
    expect(drafts).toEqual([
      { front: 'term1', back: 'first\nsecond' },
      { front: 'term2', back: 'x' },
    ]);
  });

  it('reports 1-based line numbers without a back and ignores blank lines', () => {
    const { drafts, skipped } = parseBulk('a - b\n\nnope\nc - d\n   \ne -', { term: ' - ', card: 'newline' });
    expect(drafts.map((d) => d.front)).toEqual(['a', 'c']);
    expect(skipped).toEqual([3, 6]);
  });

  it('reports the first line of a blankline block with no back', () => {
    const { skipped } = parseBulk('a\nb\n\nlonely', { term: ' - ', card: 'blankline' });
    expect(skipped).toEqual([4]);
  });

  it('handles Windows line endings', () => {
    const { drafts } = parseBulk('a - b\r\nc - d\r\n', { term: ' - ', card: 'newline' });
    expect(drafts).toEqual([{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }]);
  });

  it('supports a custom separator', () => {
    const { drafts } = parseBulk('a => b => c', { term: { custom: '=>' }, card: 'newline' });
    expect(drafts).toEqual([{ front: 'a', back: 'b => c' }]);
  });

  it('treats an empty custom separator as no separator', () => {
    const { drafts, skipped } = parseBulk('a b', { term: { custom: '' }, card: 'newline' });
    expect(drafts).toEqual([]);
    expect(skipped).toEqual([1]);
  });
});
