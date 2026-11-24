import { createContext, useContext } from 'react';
import { StorageFullError } from '../../data/repository';

export type StorageIssue = 'full' | 'unavailable';

export interface StorageErrorValue {
  issue: StorageIssue | null;
  /** Records the error when it is a storage one (quota or the database failing to open); other errors are ignored. */
  reportStorageError: (err: unknown) => void;
}

const UNAVAILABLE_NAMES = new Set(['OpenFailedError', 'DatabaseClosedError', 'MissingAPIError']);

export function classifyStorageError(err: unknown): StorageIssue | null {
  if (err instanceof StorageFullError) return 'full';
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' && UNAVAILABLE_NAMES.has(name) ? 'unavailable' : null;
}

export const StorageErrorContext = createContext<StorageErrorValue>({ issue: null, reportStorageError: () => undefined });

export function useStorageErrors(): StorageErrorValue {
  return useContext(StorageErrorContext);
}
