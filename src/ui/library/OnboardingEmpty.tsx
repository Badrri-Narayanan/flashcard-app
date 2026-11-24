import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SAMPLE_FOLDER_ID, seedSampleDecks } from '../../data/seed';
import { strings } from '../strings';

interface Props {
  onCreateDeck: () => void;
}

const card =
  'flex min-h-24 flex-col items-start gap-1 rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm dark:border-slate-700 dark:bg-slate-900';
const hint = 'text-sm font-normal text-slate-600 dark:text-slate-400';

export default function OnboardingEmpty({ onCreateDeck }: Props) {
  const o = strings.onboarding;
  const navigate = useNavigate();
  const [sampleFailed, setSampleFailed] = useState(false);

  async function trySample() {
    setSampleFailed(false);
    try {
      await seedSampleDecks();
      navigate(`/folder/${SAMPLE_FOLDER_ID}`);
    } catch (err) {
      console.error('Failed to add sample decks', err);
      setSampleFailed(true);
    }
  }
  return (
    <section className="mx-auto max-w-xl py-8 text-center">
      <h2 className="text-xl font-bold">{o.title}</h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">{o.subtitle}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onCreateDeck} aria-labelledby="ob-createDeck" aria-describedby="ob-createDeck-hint" className={`${card} border-accent-500 hover:bg-accent-50 dark:hover:bg-slate-800`}>
          <span id="ob-createDeck" className="font-semibold">{o.createDeck}</span>
          <span id="ob-createDeck-hint" className={hint}>{o.createDeckHint}</span>
        </button>
        <Link to="/import?mode=paste" aria-labelledby="ob-paste" aria-describedby="ob-paste-hint" className={`${card} hover:bg-slate-50 dark:hover:bg-slate-800`}>
          <span id="ob-paste" className="font-semibold">{o.paste}</span>
          <span id="ob-paste-hint" className={hint}>{o.pasteHint}</span>
        </Link>
        <Link to="/import" aria-labelledby="ob-importFile" aria-describedby="ob-importFile-hint" className={`${card} hover:bg-slate-50 dark:hover:bg-slate-800`}>
          <span id="ob-importFile" className="font-semibold">{o.importFile}</span>
          <span id="ob-importFile-hint" className={hint}>{o.importFileHint}</span>
        </Link>
        <button type="button" onClick={trySample} aria-labelledby="ob-sample" aria-describedby="ob-sample-hint" className={`${card} hover:bg-slate-50 dark:hover:bg-slate-800`}>
          <span id="ob-sample" className="font-semibold">{o.sample}</span>
          <span id="ob-sample-hint" className={hint}>{o.sampleHint}</span>
        </button>
      </div>
      {sampleFailed && <p role="alert" className="mt-3 text-sm text-rose-600">{o.sampleFailed}</p>}
    </section>
  );
}
