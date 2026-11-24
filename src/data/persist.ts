import { repo } from './repo';

const FLAG = 'persistRequested';

/** Asks the browser to keep our storage from being evicted; done once, on first launch. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return;
    if (await repo.getKV<boolean>(FLAG)) return;
    await repo.setKV(FLAG, true);
    await navigator.storage.persist();
  } catch (err) {
    console.error('Could not request persistent storage', err);
  }
}
