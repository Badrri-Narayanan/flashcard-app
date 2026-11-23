import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { strings } from '../strings';
import BulkPasteDialog from './BulkPasteDialog';

/** Minimal placeholder; the full import page replaces it in a later task. */
export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('mode') === 'paste');

  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8 text-center">
      <h1 className="text-2xl font-bold">{strings.importPage.title}</h1>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700"
      >
        {strings.importPage.paste}
      </button>
      <p className="text-slate-600 dark:text-slate-400">{strings.importPage.moreSoon}</p>
      <BulkPasteDialog
        open={open}
        deckId={params.get('deck') ?? undefined}
        onClose={() => {
          setOpen(false);
          setParams({}, { replace: true });
        }}
      />
    </section>
  );
}
