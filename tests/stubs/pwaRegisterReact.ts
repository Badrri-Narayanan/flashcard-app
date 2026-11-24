import type { Dispatch, SetStateAction } from 'react';

const noop: Dispatch<SetStateAction<boolean>> = () => undefined;

/** Vitest stand-in for the vite-plugin-pwa virtual module; tests override it with vi.mock when they need a pending update. */
export function useRegisterSW() {
  return {
    needRefresh: [false, noop] as [boolean, Dispatch<SetStateAction<boolean>>],
    offlineReady: [false, noop] as [boolean, Dispatch<SetStateAction<boolean>>],
    updateServiceWorker: () => Promise.resolve(),
  };
}
