import { describe, expect, it, vi } from 'vitest';
import { baseRecord } from '../../src/domain/ids';
import { isTrouble, onAfterLearnReview, suggestFixes, TROUBLE_LAPSES } from '../../src/domain/leech';
import type { Card, ReviewItem, ReviewLog, StudyMode } from '../../src/domain/types';

function mkCard(over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId: 'd', type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}
function mkItem(lapses: number): ReviewItem {
  return {
    ...baseRecord(), cardId: 'c', deckId: 'd', variant: 'fwd', due: 0, stability: 1, difficulty: 5, elapsedDays: 0,
    scheduledDays: 0, reps: 10, lapses, state: 2, lastReview: null,
  };
}
function mkLog(correct: boolean, mode: StudyMode = 'quiz', at = 1000): ReviewLog {
  return {
    ...baseRecord(), reviewItemId: 'i', cardId: 'c', deckId: 'd', mode, rating: null, correct,
    confidence: null, durationMs: 1, at, dayKey: '2026-01-01',
  };
}
const logs = (correct: number, wrong: number, mode: StudyMode = 'quiz', at = 1000) => [
  ...Array.from({ length: correct }, () => mkLog(true, mode, at)),
  ...Array.from({ length: wrong }, () => mkLog(false, mode, at)),
];

describe('isTrouble', () => {
  it('6 lapses flags trouble', () => {
    expect(TROUBLE_LAPSES).toBe(6);
    expect(isTrouble(mkItem(5), [])).toBe(false);
    expect(isTrouble(mkItem(6), [])).toBe(true);
  });

  it('low quiz accuracy flags trouble', () => {
    expect(isTrouble(mkItem(0), logs(3, 5))).toBe(true);
    expect(isTrouble(mkItem(0), logs(4, 4))).toBe(false);
    expect(isTrouble(mkItem(0), logs(1, 6))).toBe(false);
  });

  it('ignores learn-mode logs for the accuracy rule', () => {
    expect(isTrouble(mkItem(0), logs(0, 10, 'learn'))).toBe(false);
  });
});

describe('suggestFixes', () => {
  it('long back suggests split', () => {
    expect(suggestFixes(mkCard({ back: 'x'.repeat(121) }))).toContain('split');
    expect(suggestFixes(mkCard({ back: 'x'.repeat(120) }))).not.toContain('split');
  });

  it('a list of 3+ items suggests split', () => {
    expect(suggestFixes(mkCard({ back: 'a, b, c' }))).toContain('split');
    expect(suggestFixes(mkCard({ back: 'a, b' }))).not.toContain('split');
    expect(suggestFixes(mkCard({ back: '- a\n- b\n- c' }))).toContain('split');
    expect(suggestFixes(mkCard({ back: '1. a\n2. b\n3. c' }))).toContain('split');
  });

  it('suggests mnemonic when empty, image when no media, rephrase always', () => {
    expect(suggestFixes(mkCard())).toEqual(['mnemonic', 'image', 'rephrase']);
    const full = mkCard({ mnemonic: 'hook', back: 'a ![image](media:abc)' });
    expect(suggestFixes(full)).toEqual(['rephrase']);
    expect(suggestFixes(mkCard({ front: '![x](media:abc)', mnemonic: 'm' }))).toEqual(['rephrase']);
  });
});

describe('onAfterLearnReview', () => {
  it('flags a newly troublesome card, saving it with trouble=true', async () => {
    const saveCard = vi.fn().mockResolvedValue(undefined);
    const card = mkCard();
    expect(await onAfterLearnReview(card, mkItem(6), [], { saveCard })).toBe(true);
    expect(saveCard).toHaveBeenCalledWith({ ...card, trouble: true });
  });

  it('does not re-flag a card that is already trouble', async () => {
    const saveCard = vi.fn().mockResolvedValue(undefined);
    expect(await onAfterLearnReview(mkCard({ trouble: true }), mkItem(9), [], { saveCard })).toBe(false);
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('does nothing when the card is fine', async () => {
    const saveCard = vi.fn().mockResolvedValue(undefined);
    expect(await onAfterLearnReview(mkCard(), mkItem(1), logs(5, 1), { saveCard })).toBe(false);
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('flags on low accuracy but ignores logs at or before card.updatedAt', async () => {
    const saveCard = vi.fn().mockResolvedValue(undefined);
    const card = mkCard({ updatedAt: 2000 });
    expect(await onAfterLearnReview(card, mkItem(0), logs(1, 8, 'quiz', 1500), { saveCard })).toBe(false);
    expect(await onAfterLearnReview(card, mkItem(0), logs(1, 8, 'quiz', 2000), { saveCard })).toBe(false);
    expect(saveCard).not.toHaveBeenCalled();
    expect(await onAfterLearnReview(card, mkItem(0), logs(1, 8, 'quiz', 2001), { saveCard })).toBe(true);
  });

  it('ignores learn-mode logs', async () => {
    const saveCard = vi.fn().mockResolvedValue(undefined);
    expect(await onAfterLearnReview(mkCard(), mkItem(0), logs(0, 10, 'learn'), { saveCard })).toBe(false);
  });
});
