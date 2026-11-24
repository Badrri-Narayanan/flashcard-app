import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../domain/types';
import ToastRegion from '../components/ToastRegion';
import { strings } from '../strings';
import { formatDuration } from './format';
import KeyboardHelp from './KeyboardHelp';
import LoadError from '../components/LoadError';
import StudyNotice from './StudyNotice';
import StudyTopBar from './StudyTopBar';
import { isWideViewport, usePrefersReducedMotion } from './useKeyHints';
import { useMatchGame } from './useMatchGame';
import { useStudyKeys } from './useStudyKeys';

interface Props {
  deckIds: Id[];
  backTo: string;
  /** Only a single deck keeps a best time. */
  trackBest: boolean;
}

const PAIRS_NARROW = 6;
const PAIRS_WIDE = 8;
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium';

function Round({ deckIds, backTo, trackBest, onPlayAgain }: Props & { onPlayAgain(): void }) {
  const [pairTarget] = useState(() => (isWideViewport() ? PAIRS_WIDE : PAIRS_NARROW));
  const g = useMatchGame(deckIds, pairTarget, trackBest);
  const [helpOpen, setHelpOpen] = useState(false);
  const calm = usePrefersReducedMotion();
  const m = strings.study.match;

  useStudyKeys({ '?': () => setHelpOpen(true) }, !g.finished && !g.loading);

  if (g.loadFailed) return <LoadError onRetry={g.retry} backTo={backTo} />;
  if (g.loading) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (!g.available) return <StudyNotice text={m.needMoreCards} backTo={backTo} />;

  if (g.finished) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{m.resultTitle}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{m.timeResult}</p>
        <p className="text-4xl font-bold">{formatDuration(g.finalMs)}</p>
        {g.wrongTries > 0 && <p>{m.penalties(g.wrongTries)}</p>}
        {g.newBest ? (
          <p className="font-semibold">{`★ ${m.newBest}`}</p>
        ) : (
          g.previousBestMs !== null && <p>{m.best(formatDuration(g.previousBestMs))}</p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onPlayAgain} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
            {m.playAgain}
          </button>
          <Link to={backTo} className={`${button} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}>
            {strings.study.summary.backToDeck}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <StudyTopBar backTo={backTo} done={g.matched.size} total={g.pairCount} onHelp={() => setHelpOpen(true)} />
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>{m.matched(g.matched.size, g.pairCount)}</span>
        <span>
          {m.time}: <span className="font-semibold tabular-nums">{formatDuration(g.elapsedMs)}</span>
        </span>
      </div>
      <div role="group" aria-label={m.boardLabel} className="grid grid-cols-3 gap-2 md:grid-cols-4">
        {g.tiles.map((tile) =>
          g.matched.has(tile.pairId) ? (
            <div key={tile.key} aria-hidden className="min-h-20" />
          ) : (
            <button
              key={tile.key}
              type="button"
              aria-pressed={g.selected === tile.key}
              title={tile.text}
              dir="auto"
              onClick={() => g.pick(tile.key)}
              className={`flex min-h-20 items-center justify-center rounded-xl border-2 p-2 text-center text-sm leading-snug sm:text-base ${
                g.selected === tile.key
                  ? 'border-accent-600 bg-accent-50 dark:bg-slate-800'
                  : 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
              } ${g.shaking.has(tile.key) && !calm ? 'tile-shake' : ''}`}
            >
              <span className="line-clamp-4 min-w-0 break-words">{tile.text}</span>
            </button>
          ),
        )}
      </div>
      <p role="status" className="min-h-6 text-center font-medium">
        {g.shaking.size > 0 ? `✗ ${m.wrongPair}` : ''}
      </p>
      <ToastRegion toasts={g.notice ? [{ ...g.notice, durationMs: 4000 }] : []} onClose={g.clearNotice} />
      {helpOpen && <KeyboardHelp mode="match" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

export default function MatchGame(props: Props) {
  const [round, setRound] = useState(0);
  return <Round key={round} {...props} onPlayAgain={() => setRound((r) => r + 1)} />;
}
