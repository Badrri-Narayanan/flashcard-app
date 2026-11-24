import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { requestPersistentStorage } from '../../src/data/persist';

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

describe('requestPersistentStorage', () => {
  it('asks the browser once across launches', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    await requestPersistentStorage();
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });

  it('swallows a rejected request', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockRejectedValue(new Error('no')) } });
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });
});
