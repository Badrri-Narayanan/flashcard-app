import type { Confidence, Id, ReviewLog } from './types';

export const CONFIDENCE_LEVELS: Confidence[] = ['unsure', 'think', 'sure'];

/** Accuracy (percent) a well-calibrated learner would show at each confidence level. */
export const EXPECTED_ACCURACY: Record<Confidence, number> = { unsure: 33, think: 67, sure: 95 };

export const OVERCONFIDENCE_MIN_N = 5;
export const OVERCONFIDENCE_GAP = 15;

export interface CalibrationRow {
  level: Confidence;
  n: number;
  /** Whole-number percentage; 0 when n is 0. */
  accuracy: number;
}

export function calibration(logs: ReviewLog[]): CalibrationRow[] {
  return CONFIDENCE_LEVELS.map((level) => {
    const rows = logs.filter((l) => l.deletedAt === null && l.confidence === level);
    const right = rows.filter((l) => l.correct).length;
    return { level, n: rows.length, accuracy: rows.length === 0 ? 0 : Math.round((right / rows.length) * 100) };
  });
}

export function isOverconfident(row: CalibrationRow): boolean {
  return row.n >= OVERCONFIDENCE_MIN_N && row.accuracy < EXPECTED_ACCURACY[row.level] - OVERCONFIDENCE_GAP;
}

/** Cards most often answered wrongly while "sure", worst first. */
export function overconfidentCards(logs: ReviewLog[], top = 10): Id[] {
  const wrong = new Map<Id, number>();
  for (const l of logs) {
    if (l.deletedAt === null && l.confidence === 'sure' && !l.correct) wrong.set(l.cardId, (wrong.get(l.cardId) ?? 0) + 1);
  }
  return [...wrong.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([id]) => id);
}
