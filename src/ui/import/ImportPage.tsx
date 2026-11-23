import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { strings } from '../strings';
import BulkPasteDialog from './BulkPasteDialog';
import CsvImportDialog from './CsvImportDialog';

/** Minimal placeholder; the full import page replaces it in a later task. */
export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<'paste' | 'csv' | null>(() => {
    const mode = params.get('mode');
    return mode === 'paste' || mode === 'csv' ? mode : null;
  });

  const deckId = params.get('deck') ?? undefined;
  const close = () => {
    setOpen(null);
    setParams({}, { replace: true });
  };

  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8 text-center">
      <h1 className="text-2xl font-bold">{strings.importPage.title}</h1>
      <button
        type="button"
        onClick={() => setOpen('paste')}
        className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700"
      >
        {strings.importPage.paste}
      </button>
      <button
        type="button"
        onClick={() => setOpen('csv')}
        className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700"
      >
        {strings.importPage.csv}
      </button>
      <p className="text-slate-600 dark:text-slate-400">{strings.importPage.moreSoon}</p>
      <BulkPasteDialog open={open === 'paste'} deckId={deckId} onClose={close} />
      <CsvImportDialog open={open === 'csv'} deckId={deckId} onClose={close} />
    </section>
  );
}
