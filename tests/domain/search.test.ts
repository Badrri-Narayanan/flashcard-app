import { describe, it, expect } from 'vitest';
import { SearchIndex } from '../../src/domain/search';
import type { Card } from '../../src/domain/types';

function card(id: string, front: string, back = '', tags: string[] = [], over: Partial<Card> = {}): Card {
  return {
    id, deckId: 'd', type: 'basic', front, back, distractors: [], mnemonic: '', tags,
    langFront: null, langBack: null, suspended: false, trouble: false,
    createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
  };
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

describe('SearchIndex', () => {
  it('matches case- and diacritic-insensitively', () => {
    const idx = new SearchIndex([card('1', 'Café au lait'), card('2', 'tea')]);
    expect(ids(idx.search('cafe'))).toEqual(['1']);
    expect(ids(idx.search('CAFÉ'))).toEqual(['1']);
  });

  it('requires every token to match across front, back and tags', () => {
    const idx = new SearchIndex([
      card('1', 'Capital of France', 'Paris', ['geo']),
      card('2', 'Capital of Spain', 'Madrid'),
    ]);
    expect(ids(idx.search('capital paris'))).toEqual(['1']);
    expect(ids(idx.search('capital geo'))).toEqual(['1']);
    expect(ids(idx.search('capital  '))).toEqual(['1', '2']);
    expect(idx.search('capital tokyo')).toEqual([]);
  });

  it('strips Markdown syntax and media refs', () => {
    const idx = new SearchIndex([
      card('1', '**bold** _it_ `code` # Head > quote', '[site](http://x.com) ![pic](media:abc123)'),
      card('2', '```js\nlet x\n```'),
    ]);
    expect(ids(idx.search('bold it code head quote'))).toEqual(['1']);
    expect(ids(idx.search('site pic'))).toEqual(['1']);
    expect(idx.search('http')).toEqual([]);
    expect(idx.search('abc123')).toEqual([]);
    expect(idx.search('```')).toEqual([]);
    expect(ids(idx.search('let'))).toEqual(['2']);
  });

  it('ignores deleted cards and keeps input order', () => {
    const idx = new SearchIndex([
      card('3', 'apple'), card('1', 'apple', '', [], { deletedAt: 1 }), card('2', 'apple pie'),
    ]);
    expect(ids(idx.search('apple'))).toEqual(['3', '2']);
  });

  it('filters by exact tag, case-insensitively', () => {
    const idx = new SearchIndex([
      card('1', 'a', '', ['Bio']), card('2', 'a', '', ['biology']), card('3', 'b', '', ['bio']),
    ]);
    expect(ids(idx.search('', { tag: 'BIO' }))).toEqual(['1', '3']);
    expect(ids(idx.search('a', { tag: 'bio' }))).toEqual(['1']);
  });

  it('applies the limit, default 50', () => {
    const cards = Array.from({ length: 60 }, (_, i) => card(String(i), 'x'));
    const idx = new SearchIndex(cards);
    expect(idx.search('x')).toHaveLength(50);
    expect(ids(idx.search('x', { limit: 2 }))).toEqual(['0', '1']);
  });
});
