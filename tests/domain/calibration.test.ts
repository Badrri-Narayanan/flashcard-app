import { describe, expect, it } from 'vitest';
import { EXPECTED_ACCURACY, calibration, isOverconfident, overconfidentCards } from '../../src/domain/calibration';
import { baseRecord } from '../../src/domain/ids';
import type { Confidence, ReviewLog } from '../../src/domain/types';

function log(confidence: Confidence | null, correct: boolean, cardId = 'c1'): ReviewLog {
  return {
    ...baseRecord(), reviewItemId: 'i', cardId, deckId: 'd', mode: 'quiz', rating: null, correct, confidence,
    durationMs: 1, at: 0, dayKey: '2026-03-02',
  };
}

describe('calibration', () => {
  it('calibration accuracy per level', () => {
    const logs = [
      log('sure', true), log('sure', true), log('sure', false), log('sure', true),
      log('think', true), log('think', false),
      log(null, false),
    ];
    expect(calibration(logs)).toEqual([
      { level: 'unsure', n: 0, accuracy: 0 },
      { level: 'think', n: 2, accuracy: 50 },
      { level: 'sure', n: 4, accuracy: 75 },
    ]);
  });

  it('exposes expected accuracy constants', () => {
    expect(EXPECTED_ACCURACY).toEqual({ unsure: 33, think: 67, sure: 95 });
  });
});

describe('isOverconfident', () => {
  it('needs n >= 5 and actual more than 15 points under expected', () => {
    expect(isOverconfident({ level: 'sure', n: 5, accuracy: 79 })).toBe(true);
    expect(isOverconfident({ level: 'sure', n: 5, accuracy: 80 })).toBe(false);
    expect(isOverconfident({ level: 'sure', n: 4, accuracy: 10 })).toBe(false);
  });
});

describe('overconfidentCards', () => {
  it('ranks cards by wrong answers given while sure', () => {
    const logs = [
      log('sure', false, 'a'), log('sure', false, 'b'), log('sure', false, 'b'), log('sure', true, 'c'),
      log('think', false, 'c'),
    ];
    expect(overconfidentCards(logs)).toEqual(['b', 'a']);
    expect(overconfidentCards(logs, 1)).toEqual(['b']);
  });
});
