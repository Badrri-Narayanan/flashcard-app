import { describe, expect, it } from 'vitest';
import { reconcileImportedItems } from '../../src/domain/importReconcile';
import type { Card, ReviewItem, Variant } from '../../src/domain/types';

const SUSPENDED_DUE = Number.MAX_SAFE_INTEGER;
const AT = 1_000_000;

function item(id: string, variant: Variant, over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id, createdAt: 0, updatedAt: 0, deletedAt: null,
    cardId: 'card', deckId: 'deck', variant,
    due: 10, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, state: 0, lastReview: null, ...over,
  };
}

function card(type: Card['type'], front: string, over: Partial<Card> = {}): Card {
  return {
    id: 'card', createdAt: 0, updatedAt: 0, deletedAt: null,
    deckId: 'deck', type, front, back: '', distractors: [], mnemonic: '', tags: [],
    langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

const live = (put: ReviewItem[]) => put.filter((i) => i.deletedAt === null);
const variants = (put: ReviewItem[]) => live(put).map((i) => i.variant).sort();

describe('reconcileImportedItems', () => {
  it('a cloze update that adds c2 keeps the studied c1 and creates a new c2', () => {
    const c1 = item('local-c1', 'c1', { reps: 3, lastReview: 5 });
    const r = reconcileImportedItems(card('cloze', '{{c1::a}} {{c2::b}}'), 'cloze', [c1], [], AT);
    expect(variants(r.put)).toEqual(['c2']);
    expect(r.put.find((i) => i.variant === 'c2')).toMatchObject({ cardId: 'card', deckId: 'deck', reps: 0, state: 0 });
    expect(r.put.some((i) => i.id === 'local-c1')).toBe(false); // unchanged local item needs no write
  });

  it('basic → reversible adds a rev item', () => {
    const r = reconcileImportedItems(card('reversible', 'q'), 'basic', [item('fwd', 'fwd')], [], AT);
    expect(r.put.find((i) => i.id === 'fwd')).toMatchObject({ deletedAt: AT });
    expect(variants(r.put)).toEqual(['fwd', 'rev']);
  });

  it('basic → cloze retires the fwd item and creates cloze items', () => {
    const r = reconcileImportedItems(card('cloze', '{{c1::a}}'), 'basic', [item('fwd', 'fwd', { reps: 4 })], [], AT);
    expect(r.put.find((i) => i.id === 'fwd')).toMatchObject({ deletedAt: AT });
    expect(variants(r.put)).toEqual(['c1']);
  });

  it('suspension parks items at the sentinel, and unsuspending makes them due now', () => {
    const suspended = reconcileImportedItems(card('basic', 'q', { suspended: true }), 'basic', [item('a', 'fwd')], [], AT);
    expect(suspended.put).toEqual([expect.objectContaining({ id: 'a', due: SUSPENDED_DUE })]);
    const resumed = reconcileImportedItems(card('basic', 'q'), 'basic', [item('a', 'fwd', { due: SUSPENDED_DUE })], [], AT);
    expect(resumed.put).toEqual([expect.objectContaining({ id: 'a', due: AT })]);
  });

  it('moves kept items to the card deck', () => {
    const r = reconcileImportedItems(card('basic', 'q', { deckId: 'other' }), 'basic', [item('a', 'fwd')], [], AT);
    expect(r.put).toEqual([expect.objectContaining({ id: 'a', deckId: 'other' })]);
  });

  it('prefers the local item unless the incoming one was reviewed later, never leaving two per variant', () => {
    const local = item('local', 'fwd', { lastReview: 50 });
    const older = item('older', 'fwd', { lastReview: 40 });
    const keepLocal = reconcileImportedItems(card('basic', 'q'), 'basic', [local], [older], AT);
    expect(live(keepLocal.put)).toEqual([]);
    expect(keepLocal.droppedIncoming).toEqual(['older']);

    const newer = item('newer', 'fwd', { lastReview: 60 });
    const takeIncoming = reconcileImportedItems(card('basic', 'q'), 'basic', [local], [newer], AT);
    expect(live(takeIncoming.put).map((i) => i.id)).toEqual(['newer']);
    expect(takeIncoming.put.find((i) => i.id === 'local')).toMatchObject({ deletedAt: AT });
    expect(takeIncoming.droppedIncoming).toEqual([]);
  });

  it('a fresh local item loses to an incoming studied one (backup without history, then with)', () => {
    const r = reconcileImportedItems(card('basic', 'q'), 'basic', [item('fresh', 'fwd')], [item('studied', 'fwd', { lastReview: 9 })], AT);
    expect(live(r.put).map((i) => i.id)).toEqual(['studied']);
  });

  it('a new card takes incoming items for wanted variants only and creates the rest', () => {
    const r = reconcileImportedItems(card('reversible', 'q'), null, [], [item('in-fwd', 'fwd'), item('in-c1', 'c1')], AT);
    expect(variants(r.put)).toEqual(['fwd', 'rev']);
    expect(live(r.put).find((i) => i.variant === 'fwd')!.id).toBe('in-fwd');
    expect(r.droppedIncoming).toEqual(['in-c1']);
  });

  it('a deleted card passes incoming items through untouched', () => {
    const incoming = [item('x', 'fwd')];
    const r = reconcileImportedItems(card('basic', 'q', { deletedAt: 5 }), null, [], incoming, AT);
    expect(r).toEqual({ put: incoming, droppedIncoming: [] });
  });
});
