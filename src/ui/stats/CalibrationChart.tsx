import { Link } from 'react-router-dom';
import { EXPECTED_ACCURACY, isOverconfident, type CalibrationRow } from '../../domain/calibration';
import type { Card } from '../../domain/types';
import { plainPreview } from '../editor/editorLogic';
import { strings } from '../strings';

interface Props {
  rows: CalibrationRow[];
  overconfidentCards: Card[];
}

function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-3 rounded bg-slate-100 dark:bg-slate-800" aria-hidden>
      <div className={`h-3 rounded ${className}`} style={{ inlineSize: `${pct}%` }} />
    </div>
  );
}

export default function CalibrationChart({ rows, overconfidentCards }: Props) {
  const t = strings.stats;
  if (rows.every((r) => r.n === 0)) return <p className="text-slate-600 dark:text-slate-400">{t.calibrationEmpty}</p>;
  return (
    <div className="space-y-4">
      <ul className="space-y-4" aria-label={t.calibrationLabel}>
        {rows.map((row) => {
          const expected = EXPECTED_ACCURACY[row.level];
          return (
            <li key={row.level} className="space-y-1">
              <p className="font-medium">{row.n === 0 ? `${t.levels[row.level]}: ${t.noAnswers}` : t.verdict[row.level](row.accuracy)}</p>
              {row.n > 0 && (
                <>
                  <Bar pct={expected} className="bg-slate-400 dark:bg-slate-500" />
                  <Bar pct={row.accuracy} className="bg-accent-600" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t.expected(expected)} · {t.actual(row.accuracy, row.n)}
                  </p>
                  {isOverconfident(row) && <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t.overconfident}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {overconfidentCards.length > 0 && (
        <section aria-labelledby="overconfident-cards" className="space-y-2">
          <h3 id="overconfident-cards" className="font-semibold">{t.overconfidentCards}</h3>
          <ul className="space-y-1">
            {overconfidentCards.map((card) => {
              const preview = plainPreview(card.front) || t.emptyFront;
              return (
                <li key={card.id}>
                  <Link
                    to={`/deck/${card.deckId}/edit/${card.id}`}
                    aria-label={t.editCard(preview)}
                    className="inline-flex min-h-11 items-center underline"
                    dir="auto"
                  >
                    {preview}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
