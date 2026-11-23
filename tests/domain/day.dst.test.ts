import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('TZ', 'America/New_York');

describe('study day across DST (America/New_York)', () => {
  let dayKey: typeof import('../../src/domain/day').dayKey;
  let endOfStudyDay: typeof import('../../src/domain/day').endOfStudyDay;

  beforeAll(async () => {
    process.env.TZ = 'America/New_York';
    ({ dayKey, endOfStudyDay } = await import('../../src/domain/day'));
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
});
