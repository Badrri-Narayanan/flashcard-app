import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { canQuiz } from '../../domain/distractors';
import { SearchIndex } from '../../domain/search';
import type { Card } from '../../domain/types';
import ToastRegion from '../components/ToastRegion';
import { UNDO_TOAST_MS } from '../components/toastTiming';
import { strings } from '../strings';
import ShareDialog from '../share/ShareDialog';
import ExportMenu from '../library/ExportMenu';
import { plainPreview } from './editorLogic';

interface Toast {
  id: number;
  message: string;
  onUndo?: () => void;
  durationMs: number;
}

const primary = 'inline-flex min-h-11 items-center rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700';
const secondary =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
const EMPTY: Card[] = [];
let toastId = 1;

export default function DeckPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const deckResult = useLiveQuery(async () => ({ deck: await repo.getDeck(id) }), [id]);
  const cardsResult = useLiveQuery(() => repo.listCards(id), [id]);
  const cards = cardsResult ?? EMPTY;
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sharing, setSharing] = useState(false);

  const index = useMemo(() => new SearchIndex(cards), [cards]);
  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)), [cards]);
  const filtering = query.trim() !== '' || tag !== '';
  const shown = useMemo(
    () => (filtering ? index.search(query, { tag: tag || undefined, limit: cards.length }) : cards),
    [filtering, index, query, tag, cards],
  );

  if (!deckResult || !cardsResult) return <p className="px-4 py-8">{strings.common.loading}</p>;
  const { deck } = deckResult;
  if (!deck || deck.deletedAt !== null) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <p>{strings.deck.notFound}</p>
        <Link to="/" className={`${primary} mt-4`}>{strings.common.goHome}</Link>
      </section>
    );
  }

  const dismiss = (tid: number) => setToasts((t) => t.filter((x) => x.id !== tid));
  const push = (message: string, onUndo?: () => void) =>
    setToasts((t) => [...t, { id: toastId++, message, onUndo, durationMs: UNDO_TOAST_MS }]);

  async function remove(card: Card) {
    try {
      await repo.deleteCards([card.id]);
      push(strings.deck.cardDeleted, () => {
        repo.restoreCards([card.id]).catch((err: unknown) => {
          console.error('Failed to restore card', err);
          push(strings.library.actionFailed);
        });
      });
    } catch (err) {
      console.error('Failed to delete card', err);
      push(strings.library.actionFailed);
    }
  }

  const quizReady = canQuiz(cards);
  const addHref = `/deck/${id}/edit`;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{`${deck.emoji} ${deck.name}`}</h1>
          <div className="flex gap-2">
            <Link to={`/study/deck/${id}/learn`} className={secondary}>{strings.deck.study}</Link>
            {quizReady ? (
              <Link to={`/study/deck/${id}/quiz`} className={secondary}>{strings.study.quiz.entry}</Link>
            ) : (
              <button type="button" disabled aria-describedby="quiz-needs-cards" className={`${secondary} opacity-50`}>
                {strings.study.quiz.entry}
              </button>
            )}
            <ExportMenu scope="deck" id={id} />
            <button type="button" onClick={() => setSharing(true)} className={secondary}>{strings.deck.share}</button>
            <Link to={addHref} className={primary}>{strings.deck.addCard}</Link>
          </div>
        </div>
        {!quizReady && (
          <p id="quiz-needs-cards" className="text-sm text-slate-600 dark:text-slate-400">{strings.study.quiz.needMoreCards}</p>
        )}
        {cards.length > 0 && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">{strings.deck.count(cards.length)}</p>
            <input
              type="search"
              role="searchbox"
              aria-label={strings.deck.searchLabel}
              placeholder={strings.deck.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
            />
            {tags.length > 0 && (
              <div role="group" aria-label={strings.deck.tagFilter} className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tag === t}
                    onClick={() => setTag(tag === t ? '' : t)}
                    className={`min-h-11 rounded-full border px-4 text-sm ${tag === t ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </header>

      {cards.length === 0 && (
        <div className="space-y-3 py-12 text-center">
          <h2 className="text-lg font-semibold">{strings.deck.emptyTitle}</h2>
          <p className="text-slate-600 dark:text-slate-400">{strings.deck.emptyBody}</p>
          <div className="flex justify-center gap-2">
            <Link to={addHref} className={primary}>{strings.deck.addCard}</Link>
            <Link to={`/import?mode=paste&deck=${id}`} className={secondary}>{strings.deck.paste}</Link>
          </div>
        </div>
      )}
      {cards.length > 0 && shown.length === 0 && <p className="py-8 text-center text-slate-600 dark:text-slate-400">{strings.deck.noMatches}</p>}
      {shown.length > 0 && (
        <ul aria-label={strings.deck.cardList} className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
          {shown.map((c) => {
            const preview = plainPreview(c.front) || strings.deck.emptyFront;
            return (
              <li key={c.id} className="flex items-center gap-1 pe-1">
                <button
                  type="button"
                  onClick={() => navigate(`/deck/${id}/edit/${c.id}`)}
                  className="min-h-11 min-w-0 flex-1 px-4 py-2 text-start"
                >
                  <span dir="auto" className="block truncate font-medium">{preview}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{strings.editor.types[c.type]}</span>
                    {c.tags.map((t) => <span key={t}>#{t}</span>)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={strings.deck.deleteCard(preview)}
                  onClick={() => void remove(c)}
                  className="size-11 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sharing && <ShareDialog deck={deck} onClose={() => setSharing(false)} />}
      <ToastRegion toasts={toasts} onClose={dismiss} />
    </div>
  );
}
