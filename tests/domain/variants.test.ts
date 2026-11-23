import { describe, expect, it } from 'vitest';
import type { Card, ReviewItem, Variant } from '../../src/domain/types';
import { reconcileVariants, variantsFor } from '../../src/domain/variants';

function item(variant: Variant, deletedAt: number | null = null): ReviewItem {
  return {
    id: `item-${variant}`, createdAt: 0, updatedAt: 0, deletedAt,
    cardId: 'card', deckId: 'deck', variant,
    due: 0, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, state: 0, lastReview: null,
  };
}

function card(type: Card['type'], front: string): Card {
  return {
    id: 'card', createdAt: 0, updatedAt: 0, deletedAt: null,
    deckId: 'deck', type, front, back: '', distractors: [], mnemonic: '', tags: [],
    langFront: null, langBack: null, suspended: false, trouble: false,
  };
}

describe('variantsFor', () => {
  it('basic and mcq have fwd only', () => {
    expect(variantsFor({ type: 'basic', front: '' })).toEqual(['fwd']);
    expect(variantsFor({ type: 'mcq', front: '' })).toEqual(['fwd']);
  });
  it('reversible has fwd and rev', () => {
    expect(variantsFor({ type: 'reversible', front: '' })).toEqual(['fwd', 'rev']);
  });
  it('cloze has one variant per number', () => {
    expect(variantsFor({ type: 'cloze', front: '{{c1::a}} {{c3::b}}' })).toEqual(['c1', 'c3']);
  });
  it('cloze falls back to c1', () => {
    expect(variantsFor({ type: 'cloze', front: 'no blanks' })).toEqual(['c1']);
  });
});

describe('reconcileVariants', () => {
  it('keeps, removes and adds on cloze edit', () => {
    const c1 = item('c1');
    const c2 = item('c2');
    const r = reconcileVariants([c1, c2], card('cloze', '{{c2::a}} {{c3::b}}'), 'cloze');
    expect(r.keep).toEqual([c2]);
    expect(r.remove).toEqual([c1]);
    expect(r.add).toEqual(['c3']);
  });
  it('removes everything when the type changed', () => {
    const existing = [item('fwd')];
    const r = reconcileVariants(existing, card('cloze', '{{c1::a}}'), 'basic');
    expect(r.keep).toEqual([]);
    expect(r.remove).toEqual(existing);
    expect(r.add).toEqual(['c1']);
  });
  it('ignores already soft-deleted items', () => {
    const r = reconcileVariants([item('rev', 5)], card('reversible', ''), 'reversible');
    expect(r.keep).toEqual([]);
    expect(r.remove).toEqual([]);
    expect(r.add).toEqual(['fwd', 'rev']);
  });
});
