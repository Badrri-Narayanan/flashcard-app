import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../domain/types';
import CardContent from '../components/CardContent';
import ToastRegion from '../components/ToastRegion';
import SpeakButton from '../speech/SpeakButton';
import { strings } from '../strings';
import KeyboardHelp from './KeyboardHelp';
import SessionSummary from './SessionSummary';
import LoadError from '../components/LoadError';
import StudyNotice from './StudyNotice';
import StudyTopBar from './StudyTopBar';
import { useKeyHints } from './useKeyHints';
import { useQuizSession } from './useQuizSession';
import { useStudyKeys } from './useStudyKeys';

interface Props {
  deckIds: Id[];
  backTo: string;
  learnHref: string;
}

export default function QuizMode({ deckIds, backTo, learnHref }: Props) {
  const s = useQuizSession(deckIds);
  const [helpOpen, setHelpOpen] = useState(false);
  const hints = useKeyHints();
  const nextRef = useRef<HTMLButtonElement>(null);
  const q = strings.study.quiz;
  const answered = s.picked !== null;

  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);

  useStudyKeys(
    {
      '1': () => void s.answer(0),
      '2': () => void s.answer(1),
      '3': () => void s.answer(2),
      '4': () => void s.answer(3),
      Enter: s.next,
      ' ': s.next,
      '?': () => setHelpOpen(true),
    },
    !s.finished && !s.loading,
  );

  if (s.loadFailed) return <LoadError onRetry={s.retry} backTo={backTo} />;
  if (s.loading) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (!s.available) return <StudyNotice text={q.needMoreCards} backTo={backTo} />;
  if (s.questions.length === 0) return <StudyNotice text={q.empty} backTo={backTo} />;

  if (s.finished) {
    const total = s.results.length;
    const correct = s.results.filter((r) => r.correct).length;
    const missed = s.results.filter((r) => !r.correct);
    return (
      <div>
        <SessionSummary
          studied={total}
          accuracy={total === 0 ? 0 : Math.round((correct / total) * 100)}
          timeMs={s.results.reduce((sum, r) => sum + r.ms, 0)}
          backTo={backTo}
        />
        <section aria-labelledby="quiz-missed" className="mx-auto max-w-2xl space-y-3 px-4 pb-12">
          {missed.length === 0 ? (
            <p className="text-center">{q.allCorrect}</p>
          ) : (
            <>
              <h2 id="quiz-missed" className="text-lg font-semibold">
                {q.missedTitle}
              </h2>
              <ul className="space-y-2">
                {missed.map((r) => (
                  <li key={r.question.card.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <CardContent markdown={r.question.question} lang={r.question.questionLang} />
                    <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                      <p className="text-xs text-slate-600 dark:text-slate-400">{q.answerLabel}</p>
                      <CardContent markdown={r.question.options[r.question.correctIndex]} lang={r.question.optionLang} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="text-center">
                <Link to={learnHref} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700">
                  {q.studyInLearn}
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  const { current } = s;
  if (!current) return null;
  const last = s.index + 1 >= s.questions.length;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-2xl flex-col gap-4 px-4 py-4">
      <StudyTopBar backTo={backTo} done={s.index} total={s.questions.length} onHelp={() => setHelpOpen(true)} />
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{q.position(s.index + 1, s.questions.length)}</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardContent markdown={current.question} lang={current.questionLang} />
          </div>
          <SpeakButton text={current.question} lang={current.questionLang} />
        </div>
      </div>
      <div role="group" aria-label={q.optionsLabel} className="flex flex-1 flex-col gap-2">
        {current.options.map((option, i) => {
          const isCorrect = i === current.correctIndex;
          let tone = 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
          if (answered && isCorrect) tone = 'border-emerald-600 bg-emerald-100 dark:bg-emerald-950';
          else if (answered && i === s.picked) tone = 'border-rose-600 bg-rose-100 dark:bg-rose-950';
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              data-state={answered ? (isCorrect ? 'correct' : i === s.picked ? 'wrong' : 'idle') : 'idle'}
              onClick={() => void s.answer(i)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-2 text-start disabled:cursor-default ${tone}`}
            >
              {hints && <kbd aria-hidden className="rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-700">{i + 1}</kbd>}
              <span className="min-w-0 flex-1">
                <CardContent markdown={option} lang={current.optionLang} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-3 pb-2">
        <p role="status" className="min-h-6 text-center font-medium">
          {answered ? (s.picked === current.correctIndex ? q.correct : q.incorrect) : ''}
        </p>
        <button
          ref={nextRef}
          type="button"
          onClick={s.next}
          disabled={!answered}
          className="min-h-14 w-full rounded-xl bg-accent-600 font-semibold text-white hover:bg-accent-700 disabled:opacity-40"
        >
          {last ? q.seeResults : q.next}
        </button>
      </div>
      <ToastRegion toasts={s.notice ? [{ ...s.notice, durationMs: 4000 }] : []} onClose={s.clearNotice} />
      {helpOpen && <KeyboardHelp mode="quiz" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
