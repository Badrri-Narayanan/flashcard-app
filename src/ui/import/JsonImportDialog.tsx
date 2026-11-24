import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { applyImport, readBackupFile } from '../../data/backupIO';
import { repo } from '../../data/repo';
import { planImport, type BackupFile, type MergeMode } from '../../domain/backup';
import type { Folder } from '../../domain/types';
import Dialog from '../components/Dialog';
import { strings } from '../strings';

interface Props {
  onClose: () => void;
  /** Read as soon as the dialog opens, e.g. a file dropped on the import page. */
  initialFile?: File;
}

const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800';

function folderLabels(folders: Folder[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) byParent.set(f.parentId, [...(byParent.get(f.parentId) ?? []), f]);
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const f of byParent.get(parent) ?? []) {
      if (seen.has(f.id)) continue;
      out.push({ id: f.id, label: `${'  '.repeat(depth)}${f.emoji} ${f.name}`.trim() });
      walk(f.id, depth + 1, new Set(seen).add(f.id));
    }
  };
  walk(null, 0, new Set());
  return out;
}

export default function JsonImportDialog({ onClose, initialFile }: Props) {
  const folders = useLiveQuery(() => repo.listFolders(), []);
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MergeMode>('update');
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      setBackup(await readBackupFile(file));
    } catch (err) {
      setBackup(null);
      setError(err instanceof Error ? err.message : strings.importPage.readFailed);
    }
  }

  useEffect(() => {
    if (!initialFile) {
      fileRef.current?.focus();
      return;
    }
    const t = setTimeout(() => void load(initialFile), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the file present at mount is auto-loaded
  }, []);

  async function submit() {
    if (!backup || busy) return;
    setBusy(true);
    setError(null);
    try {
      const plan = planImport(backup, await repo.getExistingMeta(), mode, folderId || null);
      await applyImport(plan);
      const { added, updated, skipped, invalid } = plan.summary;
      setSummary(strings.json.summary(added, updated, skipped, invalid));
      setBackup(null);
    } catch (err) {
      console.error('Failed to import backup', err);
      setError(strings.json.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={strings.json.title} onClose={onClose}>
      {summary ? (
        <div className="space-y-4">
          <p role="status" className="font-medium">{summary}</p>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700">
            {strings.json.done}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <label className="block rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm font-medium dark:border-slate-700">
            <span className="block">{strings.json.file}</span>
            <span className="block font-normal text-slate-600 dark:text-slate-400">{strings.json.dropHint}</span>
            <input
              ref={fileRef}
              aria-label={strings.json.file}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void load(e.target.files?.[0])}
              className="mt-2 block min-h-11 w-full text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{strings.json.mode}</legend>
            {(['update', 'copy'] as const).map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="merge-mode" checked={mode === m} onChange={() => setMode(m)} className="size-4" />
                {m === 'update' ? strings.json.update : strings.json.copy}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium">
            {strings.json.target}
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={fieldClass}>
              <option value="">{strings.json.topLevel}</option>
              {folderLabels(folders ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!backup || busy}
            className="min-h-11 rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy ? strings.json.importing : strings.json.submit}
          </button>
        </form>
      )}
    </Dialog>
  );
}
