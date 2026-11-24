import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DiffPart } from '../../domain/matcher';
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
import { useStudyKeys } from './useStudyKeys';
import { useTypeSession } from './useTypeSession';

interface Props {
  deckIds: Id[];
  backTo: string;
  learnHref: string;
}

function Diff({ parts }: { parts: DiffPart[] }) {
  const t = strings.study.type;
  return (
    <p aria-label={t.diffLabel} className="break-words font-mono text-lg">
      {parts.map((part, i) =>
        part.op === 'eq' ? (
          <span key={i}>{part.text}</span>
        ) : part.op === 'del' ? (
          <del key={i} title={t.diffExtra} className="text-rose-700 dark:text-rose-300">{part.text}</del>
        ) : (
          <ins key={i} title={t.diffMissing} className="text-emerald-700 underline decoration-2 dark:text-emerald-300">{part.text}</ins>
        ),
      )}
    </p>
  );
}

export default function TypeMode({ deckIds, backTo, learnHref }: Props) {
  const s = useTypeSession(deckIds);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const t = strings.study.type;
  const checked = s.checked;
  const isChecked = checked !== null;

  useEffect(() => {
    if (isChecked) nextRef.current?.focus();
    else inputRef.current?.focus();
  }, [isChecked, s.index, s.loading]);

  const overridden = checked?.overridden ?? false;
  useEffect(() => {
    if (overridden) nextRef.current?.focus();
  }, [overridden]);

  const goNext = () => {
    setDraft('');
    s.next();
  };

  useStudyKeys(
    {
      r: () => void s.override(),
      Enter: () => goNext(),
      '?': () => setHelpOpen(true),
    },
    !s.finished && !s.loading,
  );

  if (s.loadFailed) return <LoadError onRetry={s.retry} backTo={backTo} />;
  if (s.loading) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (s.items.length === 0) return <StudyNotice text={t.empty} backTo={backTo} />;

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
        <section aria-labelledby="type-missed" className="mx-auto max-w-2xl space-y-3 px-4 pb-12">
          {missed.length === 0 ? (
            <p className="text-center">{t.allCorrect}</p>
          ) : (
            <>
              <h2 id="type-missed" className="text-lg font-semibold">{t.missedTitle}</h2>
              <ul className="space-y-2">
                {missed.map((r) => (
                  <li key={r.item.card.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <CardContent markdown={r.item.question} lang={r.item.questionLang} />
                    <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                      <p className="text-xs text-slate-600 dark:text-slate-400">{t.answerLabel}</p>
                      <CardContent markdown={r.item.answer} lang={r.item.answerLang} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="text-center">
                <Link to={learnHref} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700">
                  {t.studyInLearn}
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
  const last = s.index + 1 >= s.items.length;
  const verdict = checked?.match.verdict;
  const headline = !checked
    ? ''
    : checked.overridden
      ? t.overridden
      : verdict === 'exact'
        ? t.correct
        : verdict === 'close'
          ? t.close
          : t.wrong;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-2xl flex-col gap-4 px-4 py-4">
      <StudyTopBar backTo={backTo} done={s.index} total={s.items.length} onHelp={() => setHelpOpen(true)} />
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{t.position(s.index + 1, s.items.length)}</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardContent markdown={current.question} lang={current.questionLang} />
          </div>
          <SpeakButton text={current.question} lang={current.questionLang} />
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isChecked) void s.check(draft);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          lang={current.answerLang}
          aria-label={t.inputLabel}
          autoFocus
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          readOnly={isChecked}
          value={isChecked ? checked.input : draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={isChecked}
          className="min-h-12 rounded-xl bg-accent-600 px-5 font-semibold text-white hover:bg-accent-700 disabled:opacity-40"
        >
          {t.check}
        </button>
      </form>
      <div className="flex-1 space-y-3">
        <p role="status" className="min-h-6 text-center font-medium">
          {checked && (
            <>
              <span aria-hidden>{checked.correct ? '✓ ' : '✗ '}</span>
              {headline}
            </>
          )}
        </p>
        {checked && verdict !== 'exact' && !checked.overridden && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <Diff parts={checked.match.diff} />
            {verdict === 'wrong' && (
              <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                <p className="text-xs text-slate-600 dark:text-slate-400">{t.expected}</p>
                <CardContent markdown={current.answer} lang={current.answerLang} />
              </div>
            )}
          </div>
        )}
        {checked && !checked.correct && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => void s.override()}
              className="min-h-11 rounded-lg border border-slate-300 px-5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t.override}
            </button>
          </div>
        )}
      </div>
      <button
        ref={nextRef}
        type="button"
        onClick={goNext}
        disabled={!isChecked}
        className="min-h-14 w-full rounded-xl bg-accent-600 font-semibold text-white hover:bg-accent-700 disabled:opacity-40"
      >
        {last ? t.seeResults : t.next}
      </button>
      <ToastRegion toasts={s.notice ? [{ ...s.notice, durationMs: 4000 }] : []} onClose={s.clearNotice} />
      {helpOpen && <KeyboardHelp mode="type" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
