import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { repo } from '../../data/repo';
import { StorageErrorContext, classifyStorageError, type StorageIssue } from './storageError';

export default function StorageErrorProvider({ children }: { children: ReactNode }) {
  const [issue, setIssue] = useState<StorageIssue | null>(null);

  const reportStorageError = useCallback((err: unknown) => {
    const found = classifyStorageError(err);
    if (found) setIssue((prev) => prev ?? found);
  }, []);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => reportStorageError(e.reason);
    window.addEventListener('unhandledrejection', onRejection);
    repo.getKV('storageProbe').catch(reportStorageError);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [reportStorageError]);

  const value = useMemo(() => ({ issue, reportStorageError }), [issue, reportStorageError]);
  return <StorageErrorContext.Provider value={value}>{children}</StorageErrorContext.Provider>;
}
