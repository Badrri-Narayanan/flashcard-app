import { useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { strings } from '../strings';
import BulkPasteDialog from './BulkPasteDialog';
import CsvImportDialog from './CsvImportDialog';
import JsonImportDialog from './JsonImportDialog';

type Mode = 'paste' | 'csv' | 'json';

interface Active {
  mode: Mode;
  text?: string;
  file?: File;
}

const tile =
  'block min-h-11 w-full rounded-xl border border-slate-300 bg-white p-4 text-start hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState<Active | null>(() => {
    const mode = params.get('mode');
    return mode === 'paste' || mode === 'csv' || mode === 'json' ? { mode } : null;
  });
  const [message, setMessage] = useState<string | null>(null);

  const deckId = params.get('deck') ?? undefined;
  const close = () => {
    setActive(null);
    setParams({}, { replace: true });
  };

  async function route(file: File) {
    setMessage(null);
    const ext = file.name.toLowerCase().match(/\.([^./\\]+)$/)?.[1];
    if (ext === 'csv' || ext === 'tsv') setActive({ mode: 'csv', file });
    else if (ext === 'json') setActive({ mode: 'json', file });
    else if (ext === 'txt') {
      try {
        setActive({ mode: 'paste', text: await readText(file) });
      } catch (err) {
        console.error('Failed to read dropped file', err);
        setMessage(strings.importPage.readFailed);
      }
    } else setMessage(strings.importPage.unsupported(file.name));
  }

  function onDrop(e: DragEvent) {
    // A dialog's own drop zone has already handled the file.
    if (e.defaultPrevented) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void route(file);
  }

  const open = (mode: Mode) => {
    setMessage(null);
    setActive({ mode });
  };

  return (
    <section
      data-testid="import-page"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="mx-auto min-h-[60vh] max-w-md space-y-4 px-4 py-8"
    >
      <h1 className="text-2xl font-bold">{strings.importPage.title}</h1>
      <button type="button" onClick={() => open('paste')} aria-label={strings.importPage.paste} aria-describedby="import-hint-paste" className={tile}>
        <span className="block font-medium">{strings.importPage.paste}</span>
        <span id="import-hint-paste" className="block text-sm text-slate-600 dark:text-slate-400">{strings.importPage.pasteHint}</span>
      </button>
      <button type="button" onClick={() => open('csv')} aria-label={strings.importPage.csv} aria-describedby="import-hint-csv" className={tile}>
        <span className="block font-medium">{strings.importPage.csv}</span>
        <span id="import-hint-csv" className="block text-sm text-slate-600 dark:text-slate-400">{strings.importPage.csvHint}</span>
      </button>
      <button type="button" onClick={() => open('json')} aria-label={strings.importPage.json} aria-describedby="import-hint-json" className={tile}>
        <span className="block font-medium">{strings.importPage.json}</span>
        <span id="import-hint-json" className="block text-sm text-slate-600 dark:text-slate-400">{strings.importPage.jsonHint}</span>
      </button>
      <p className="text-sm text-slate-600 dark:text-slate-400">{strings.importPage.dropHint}</p>
      {message && (
        <p role="alert" className="text-sm text-rose-600">
          {message}
        </p>
      )}
      <BulkPasteDialog open={active?.mode === 'paste'} deckId={deckId} initialText={active?.text} onClose={close} />
      <CsvImportDialog open={active?.mode === 'csv'} deckId={deckId} initialFile={active?.file} onClose={close} />
      {active?.mode === 'json' && <JsonImportDialog initialFile={active.file} onClose={close} />}
    </section>
  );
}
