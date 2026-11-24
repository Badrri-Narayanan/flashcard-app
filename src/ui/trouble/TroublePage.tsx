import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { suggestFixes, type Fix } from '../../domain/leech';
import type { Card } from '../../domain/types';
import { plainPreview } from '../editor/editorLogic';
import { strings } from '../strings';

const FOCUS: Record<Fix, string> = { split: 'back', mnemonic: 'mnemonic', image: 'back', rephrase: 'front' };
const secondary =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700';

export default function TroublePage() {
  const [params] = useSearchParams();
  const deckId = params.get('deck');
  const cards = useLiveQuery(async () => {
    const all = deckId ? await repo.listCards(deckId) : await repo.listAllCards();
    return all.filter((c) => c.trouble);
  }, [deckId]);
  const [failed, setFailed] = useState(false);

  async function run(action: () => Promise<void>) {
    setFailed(false);
    try {
      await action();
    } catch (err) {
      console.error('Trouble card action failed', err);
      setFailed(true);
    }
  }

  const suspend = (card: Card) => run(() => repo.saveCard({ ...card, suspended: true }));

  const markFixed = (card: Card) =>
    run(() =>
      repo.transaction(async () => {
        const items = await repo.getReviewItemsForCard(card.id);
        await repo.saveReviewItems(items.map((i) => ({ ...i, lapses: 0 })));
        await repo.saveCard({ ...card, trouble: false });
      }),
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold">{strings.trouble.title}</h1>
      {!cards && <p>{strings.common.loading}</p>}
      {cards && cards.length === 0 && (
        <div className="space-y-3 py-8 text-center">
          <p className="text-slate-600 dark:text-slate-400">{strings.trouble.empty}</p>
          <Link to={deckId ? `/deck/${deckId}` : '/study'} className={secondary}>{strings.trouble.back}</Link>
        </div>
      )}
      {cards && cards.length > 0 && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">{strings.trouble.intro}</p>
          <ul className="space-y-3">
            {cards.map((card) => {
              const preview = plainPreview(card.front) || strings.deck.emptyFront;
              return (
                <li key={card.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="auto" className="min-w-0 flex-1 truncate font-medium">{preview}</span>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                      {strings.trouble.badge}
                    </span>
                    {card.suspended && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{strings.trouble.suspendedBadge}</span>
                    )}
                  </div>
                  <div role="group" aria-label={strings.trouble.suggestionsLabel(preview)} className="flex flex-wrap gap-2">
                    {suggestFixes(card).map((fix) => (
                      <Link key={fix} to={`/deck/${card.deckId}/edit/${card.id}?focus=${FOCUS[fix]}`} className={secondary}>
                        {strings.trouble.fixes[fix]}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!card.suspended && (
                      <button type="button" aria-label={strings.trouble.suspendLabel(preview)} onClick={() => void suspend(card)} className={secondary}>
                        {strings.trouble.suspend}
                      </button>
                    )}
                    <button type="button" aria-label={strings.trouble.markFixedLabel(preview)} onClick={() => void markFixed(card)} className={primary}>
                      {strings.trouble.markFixed}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {failed && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{strings.trouble.actionFailed}</p>}
    </div>
  );
}
