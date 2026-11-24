import { useState } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import type { BackupScope } from '../../domain/backup';
import type { Deck, Id } from '../../domain/types';
import Dialog from '../components/Dialog';
import ShareDialog from '../share/ShareDialog';
import { strings } from '../strings';
import { runExport } from './runExport';

interface Props {
  scope: BackupScope;
  id: Id | null;
}

interface DialogProps extends Props {
  onClose: () => void;
}

const item =
  'flex min-h-11 w-full items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

/** The export choices for one scope; used directly by row menus and wrapped by {@link ExportMenu}. */
export function ExportDialog({ scope, id, onClose }: DialogProps) {
  const [history, setHistory] = useState(scope === 'library');
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState<Deck | null>(null);

  async function run(kind: 'json' | 'csv') {
    setError(false);
    try {
      await runExport(scope, id, kind, history);
    } catch (err) {
      console.error('Failed to export', err);
      setError(true);
    }
  }

  async function share() {
    setError(false);
    const deck = id ? await repo.getDeck(id) : undefined;
    if (deck) setSharing(deck);
    else setError(true);
  }

  if (sharing) return <ShareDialog deck={sharing} onClose={onClose} />;

  return (
    <Dialog title={strings.export.title} onClose={onClose}>
      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="size-4" />
          {strings.export.includeHistory}
        </label>
        <button type="button" onClick={() => void run('json')} className={item}>{strings.export.json}</button>
        {scope === 'deck' && (
          <>
            <button type="button" onClick={() => void run('csv')} className={item}>{strings.export.csv}</button>
            <button type="button" onClick={() => void share()} className={item}>{strings.export.share}</button>
            <Link to={`/print/${id}`} onClick={onClose} className={item}>{strings.export.print}</Link>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {strings.export.failed}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const trigger =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

/** A button that opens the export choices for a library, folder or deck. */
export default function ExportMenu({ scope, id }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger}>
        {strings.export.open}
      </button>
      {open && <ExportDialog scope={scope} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
