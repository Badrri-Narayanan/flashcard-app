import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('TZ', 'America/New_York');

describe('study day across DST (America/New_York)', () => {
  let dayKey: typeof import('../../src/domain/day').dayKey;
  let endOfStudyDay: typeof import('../../src/domain/day').endOfStudyDay;
  let startOfStudyDay: typeof import('../../src/domain/day').startOfStudyDay;

  beforeAll(async () => {
    process.env.TZ = 'America/New_York';
    ({ dayKey, endOfStudyDay, startOfStudyDay } = await import('../../src/domain/day'));
  });

  it('runs in the expected zone', () => {
    expect(new Date(2026, 2, 8, 4, 30).getTimezoneOffset()).toBe(240);
  });

  it('spring forward: 04:30 on Mar 8 belongs to Mar 8', () => {
    const at = new Date(2026, 2, 8, 4, 30).getTime();
    expect(dayKey(at, 4)).toBe('2026-03-08');
    expect(endOfStudyDay(at, 4)).toBe(new Date(2026, 2, 9, 4).getTime());
  });

  it('fall back: 03:30 on Nov 1 belongs to Oct 31', () => {
    const at = new Date(2026, 10, 1, 3, 30).getTime();
    expect(dayKey(at, 4)).toBe('2026-10-31');
    expect(endOfStudyDay(at, 4)).toBe(new Date(2026, 10, 1, 4).getTime());
  });

  it('startOfStudyDay is the previous 04:00 boundary, DST-safe', () => {
    const afterBoundary = new Date(2026, 2, 8, 12).getTime();
    expect(startOfStudyDay(afterBoundary, 4)).toBe(new Date(2026, 2, 8, 4).getTime());
    const beforeBoundary = new Date(2026, 2, 9, 3).getTime();
    expect(startOfStudyDay(beforeBoundary, 4)).toBe(new Date(2026, 2, 8, 4).getTime());
    // study days that contain a DST change are 23h / 25h long, so end - 24h would be wrong
    const springDay = new Date(2026, 2, 8, 3).getTime();
    expect(endOfStudyDay(springDay, 4) - startOfStudyDay(springDay, 4)).toBe(23 * 3_600_000);
    const fallDay = new Date(2026, 10, 1, 3).getTime();
    expect(endOfStudyDay(fallDay, 4) - startOfStudyDay(fallDay, 4)).toBe(25 * 3_600_000);
  });
});
