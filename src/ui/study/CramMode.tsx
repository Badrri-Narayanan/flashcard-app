import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../domain/types';
import { strings } from '../strings';
import { cardFaces, cramVariant } from './faces';
import FlipCard from './FlipCard';
import KeyboardHelp from './KeyboardHelp';
import SessionSummary from './SessionSummary';
import StudyTopBar from './StudyTopBar';
import { useCramSession } from './useCramSession';
import { useKeyHints } from './useKeyHints';
import { useStudyKeys } from './useStudyKeys';

interface Props {
  deckIds: Id[];
  backTo: string;
}

const nav = 'min-h-11 rounded-lg px-4 font-medium hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800';

export default function CramMode({ deckIds, backTo }: Props) {
  const s = useCramSession(deckIds);
  const [helpOpen, setHelpOpen] = useState(false);
  const hints = useKeyHints();
  const c = strings.study.cram;

  const mark = (correct: boolean) => {
    if (s.revealed) void s.mark(correct);
  };
  useStudyKeys(
    {
      ' ': s.flip,
      '1': () => mark(false),
      '3': () => mark(true),
      ArrowRight: s.next,
      ArrowLeft: s.prev,
      '?': () => setHelpOpen(true),
    },
    !s.finished,
  );

  if (s.loading) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (s.entries.length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
        <p>{c.empty}</p>
        <Link to={backTo} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-5 font-medium dark:border-slate-700">
          {strings.study.back}
        </Link>
      </section>
    );
  }
  if (s.finished) {
    const { studied, correct, timeMs } = s.stats;
    return (
      <SessionSummary
        studied={studied}
        accuracy={studied === 0 ? 0 : Math.round((correct / studied) * 100)}
        timeMs={timeMs}
        backTo={backTo}
      />
    );
  }

  const { current } = s;
  const faces = current ? cardFaces(current.card, current.deck, cramVariant(current.card)) : null;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-2xl flex-col gap-4 px-4 py-4">
      <StudyTopBar backTo={backTo} done={s.index} total={s.entries.length} onHelp={() => setHelpOpen(true)} />
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{c.position(s.index + 1, s.entries.length)}</p>
      <div className="flex flex-1 flex-col justify-center">
        {current && faces && (
          <FlipCard key={current.card.id} faces={faces} mnemonic={current.card.mnemonic} revealed={s.revealed} onFlip={s.flip} />
        )}
      </div>
      <div className="space-y-3 pb-2">
        {s.revealed && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => mark(false)} className="min-h-14 rounded-xl bg-rose-600 font-semibold text-white hover:bg-rose-700">
              {c.again}
              {hints && <kbd aria-hidden className="ms-2 rounded bg-white/20 px-1.5 text-xs">1</kbd>}
            </button>
            <button type="button" onClick={() => mark(true)} className="min-h-14 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700">
              {c.gotIt}
              {hints && <kbd aria-hidden className="ms-2 rounded bg-white/20 px-1.5 text-xs">3</kbd>}
            </button>
          </div>
        )}
        <div className="flex justify-between">
          <button type="button" onClick={s.prev} disabled={s.index === 0} className={nav}>
            {c.prev}
          </button>
          <button type="button" onClick={s.next} disabled={s.index + 1 >= s.entries.length} className={nav}>
            {c.next}
          </button>
        </div>
      </div>
      {helpOpen && <KeyboardHelp mode="cram" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
