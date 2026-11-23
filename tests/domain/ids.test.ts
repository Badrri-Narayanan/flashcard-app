import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { baseRecord, newId, now, touch } from '../../src/domain/ids';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ids', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('newId returns a UUID v4 string', () => {
    expect(newId()).toMatch(UUID_PATTERN);
  });

  it('newId returns a different id on each call', () => {
    expect(newId()).not.toBe(newId());
  });

  it('now returns the current epoch milliseconds', () => {
    expect(now()).toBe(1_000);
  });

  it('baseRecord has uuid and equal timestamps', () => {
    const record = baseRecord();
    expect(record.id).toMatch(UUID_PATTERN);
    expect(record.createdAt).toBe(1_000);
    expect(record.updatedAt).toBe(1_000);
    expect(record.deletedAt).toBeNull();
  });

  it('touch bumps updatedAt only', () => {
    const original = { ...baseRecord(), name: 'deck' };
    vi.setSystemTime(2_000);

    const touched = touch(original);

    expect(touched).not.toBe(original);
    expect(touched.updatedAt).toBe(2_000);
    expect(touched.createdAt).toBe(original.createdAt);
    expect(touched.id).toBe(original.id);
    expect(touched.deletedAt).toBe(original.deletedAt);
    expect(touched.name).toBe('deck');
    expect(original.updatedAt).toBe(1_000);
  });
});
