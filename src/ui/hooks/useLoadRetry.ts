import { useCallback, useEffect, useRef, useState } from 'react';
import { useStorageErrors } from '../components/storageError';

export interface LoadRetry {
  /** Add to a loader effect's dependencies; bumped by `retry`. */
  attempt: number;
  failed: boolean;
  /** Marks the load as failed and passes storage errors on to the storage banner. */
  fail(err: unknown): void;
  retry(): void;
}

/** Failure and retry state for a one-shot loader, so a failed read shows an error instead of an empty state. */
export function useLoadRetry(): LoadRetry {
  const { reportStorageError } = useStorageErrors();
  const report = useRef(reportStorageError);
  useEffect(() => {
    report.current = reportStorageError;
  }, [reportStorageError]);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const fail = useCallback((err: unknown) => {
    report.current(err);
    setFailed(true);
  }, []);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((a) => a + 1);
  }, []);
  return { attempt, failed, fail, retry };
}
