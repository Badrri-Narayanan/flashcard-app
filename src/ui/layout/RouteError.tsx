import { useEffect, useState } from 'react';
import { useRouteError } from 'react-router-dom';
import { useStorageErrors } from '../components/storageError';
import { runExport } from '../library/runExport';
import { strings } from '../strings';

/** Route errorElement: a friendly screen with Reload and a backup attempt instead of the router's default crash page. */
export default function RouteError() {
  const error = useRouteError();
  const { reportStorageError } = useStorageErrors();
  const [exportFailed, setExportFailed] = useState(false);
  const t = strings.routeError;

  useEffect(() => {
    console.error('Route failed to render', error);
    reportStorageError(error);
  }, [error, reportStorageError]);

  async function exportNow() {
    setExportFailed(false);
    try {
      await runExport('library', null, 'json', true);
    } catch (err) {
      console.error('Backup from error screen failed', err);
      setExportFailed(true);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p>{t.body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700">
          {t.reload}
        </button>
        <button type="button" onClick={() => void exportNow()} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          {t.exportBackup}
        </button>
      </div>
      {exportFailed && <p role="alert">{t.exportFailed}</p>}
    </section>
  );
}
