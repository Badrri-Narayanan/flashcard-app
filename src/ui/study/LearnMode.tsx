import { useState } from 'react';
import { strings } from '../strings';
import AllCaughtUp from './AllCaughtUp';
import ConfidencePrompt from './ConfidencePrompt';
import { cardFaces } from './faces';
import FlipCard from './FlipCard';
import KeyboardHelp from './KeyboardHelp';
import RatingBar from './RatingBar';
import SessionSummary from './SessionSummary';
import StudyTopBar from './StudyTopBar';
import { useKeyHints } from './useKeyHints';
import { useLearnSession } from './useLearnSession';
import { useStudyKeys } from './useStudyKeys';
import type { Id, Rating } from '../../domain/types';

interface Props {
  deckIds: Id[];
  backTo: string;
  cramHref: string;
}

export default function LearnMode({ deckIds, backTo, cramHref }: Props) {
  const s = useLearnSession(deckIds);
  const [helpOpen, setHelpOpen] = useState(false);
  const hints = useKeyHints();
  const { current, revealed } = s;

  const rate = (r: Rating) => {
    if (revealed) void s.answer(r);
  };
  useStudyKeys(
    {
      ' ': s.reveal,
      '1': () => rate(1),
      '2': () => rate(2),
      '3': () => rate(3),
      '4': () => rate(4),
      z: () => void s.undo(),
      '?': () => setHelpOpen(true),
    },
    !s.finished,
  );

  if (s.error) return <p role="alert" className="p-8 text-center">{strings.study.loadFailed}</p>;
  if (s.loading) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (s.finished) {
    if (s.stats.answers === 0) return <AllCaughtUp nextDueAt={s.nextDueAt} backTo={backTo} cramHref={cramHref} />;
    return (
      <SessionSummary
        studied={s.stats.studied}
        accuracy={Math.round((s.stats.correct / s.stats.answers) * 100)}
        timeMs={s.stats.timeMs}
        backTo={backTo}
        onStudyMore={s.moreNewAvailable ? s.studyMore : undefined}
      />
    );
  }

  const total = s.progress.done + s.progress.remaining;
  const faces = current ? cardFaces(current.card, current.deck, current.item.variant) : null;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-2xl flex-col gap-4 px-4 py-4">
      <StudyTopBar backTo={backTo} done={s.progress.done} total={total} onHelp={() => setHelpOpen(true)}>
        <button
          type="button"
          onClick={() => void s.undo()}
          disabled={!s.canUndo}
          aria-label={strings.study.undoLabel}
          className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800"
        >
          {strings.study.undo}
        </button>
      </StudyTopBar>
      <div className="flex flex-1 flex-col justify-center">
        {current && faces && (
          <FlipCard
            faces={faces}
            mnemonic={current.card.mnemonic}
            revealed={revealed}
            onFlip={s.reveal}
            onSwipeRate={rate}
          />
        )}
      </div>
      {current && (
        <div className="space-y-3 pb-2">
          {revealed && s.intervals ? (
            <RatingBar intervals={s.intervals} onRate={rate} showHints={hints} />
          ) : (
            <>
              {current.deck.settings.confidencePrompt && <ConfidencePrompt onChoose={s.setConfidence} />}
              <button
                type="button"
                onClick={s.reveal}
                className="min-h-12 w-full rounded-xl bg-accent-600 font-medium text-white hover:bg-accent-700"
              >
                {strings.study.show}
                {hints && <kbd className="ms-2 rounded bg-white/20 px-1.5 text-xs">Space</kbd>}
              </button>
            </>
          )}
        </div>
      )}
      {helpOpen && <KeyboardHelp mode="learn" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
