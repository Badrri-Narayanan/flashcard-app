import { describe, expect, it } from 'vitest';
import { dayKey, endOfStudyDay } from '../../src/domain/day';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('dayKey', () => {
  it('at 02:00 with start 4 returns previous date', () => {
    expect(dayKey(local(2026, 3, 10, 2), 4)).toBe('2026-03-09');
  });
  it('at 05:00 returns same date', () => {
    expect(dayKey(local(2026, 3, 10, 5), 4)).toBe('2026-03-10');
  });
  it('zero pads and crosses month/year boundaries', () => {
    expect(dayKey(local(2026, 1, 1, 1), 4)).toBe('2025-12-31');
    expect(dayKey(local(2026, 2, 3, 12), 4)).toBe('2026-02-03');
  });
});

describe('endOfStudyDay', () => {
  it('before the boundary returns today boundary', () => {
    expect(endOfStudyDay(local(2026, 3, 10, 2), 4)).toBe(local(2026, 3, 10, 4));
  });
  it('after the boundary returns tomorrow boundary', () => {
    expect(endOfStudyDay(local(2026, 3, 10, 5), 4)).toBe(local(2026, 3, 11, 4));
  });
  it('exactly at the boundary is strictly after', () => {
    expect(endOfStudyDay(local(2026, 3, 10, 4), 4)).toBe(local(2026, 3, 11, 4));
  });
  it('rolls over month end', () => {
    expect(endOfStudyDay(local(2026, 1, 31, 23), 4)).toBe(local(2026, 2, 1, 4));
  });
});
