import { useState } from 'react';
import { runExport } from '../library/runExport';
import { strings } from '../strings';
import { useStorageErrors } from './storageError';

export default function StorageBanner() {
  const { issue } = useStorageErrors();
  const [exportFailed, setExportFailed] = useState(false);
  const t = strings.pwa;
  if (!issue) return null;

  async function exportNow() {
    setExportFailed(false);
    try {
      await runExport('library', null, 'json', true);
    } catch (err) {
      console.error('Backup from storage banner failed', err);
      setExportFailed(true);
    }
  }

  return (
    <div role="alert" className="border-b border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
      <p>{issue === 'full' ? t.storageFull : t.storageUnavailable}</p>
      <button type="button" onClick={exportNow} className="mt-2 min-h-11 rounded-lg bg-rose-700 px-4 font-semibold text-white hover:bg-rose-800">
        {t.exportBackup}
      </button>
      {exportFailed && <p className="mt-2 font-medium">{t.exportFailed}</p>}
    </div>
  );
}
