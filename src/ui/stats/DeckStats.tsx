import type { Deck, Id } from '../../domain/types';
import type { DeckBreakdown } from '../../domain/stats';
import { strings } from '../strings';

interface Props {
  decks: Deck[];
  /** 'all' or a deck id. */
  selected: Id | 'all';
  onSelect: (id: Id | 'all') => void;
  breakdown: DeckBreakdown;
  /** Reviews due per study day, day 0 first. */
  forecast: number[];
  /** Short weekday/date labels for each forecast day. */
  forecastLabels: string[];
}

const BAR_W = 20;
const BAR_GAP = 6;
const CHART_H = 80;

export default function DeckStats({ decks, selected, onSelect, breakdown, forecast, forecastLabels }: Props) {
  const t = strings.stats;
  const max = Math.max(1, ...forecast);
  const width = forecast.length * (BAR_W + BAR_GAP);
  const buckets: [string, number][] = [
    [t.bucketNew, breakdown.new],
    [t.bucketLearning, breakdown.learning],
    [t.bucketReview, breakdown.review],
    [t.bucketSuspended, breakdown.suspended],
  ];
  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t.deckSelect}</span>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="all">{t.allDecks}</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {buckets.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <dt className="text-xs text-slate-600 dark:text-slate-400">{t.retention}</dt>
          <dd className="text-xl font-semibold">{breakdown.retention === null ? t.retentionNone : `${breakdown.retention}%`}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-600 dark:text-slate-400">{t.retentionHelp}</p>
      <section aria-labelledby="forecast-heading" className="space-y-2">
        <h3 id="forecast-heading" className="font-semibold">{t.forecastHeading}</h3>
        {forecast.every((n) => n === 0) && <p className="text-slate-600 dark:text-slate-400">{t.forecastEmpty}</p>}
        <div className="overflow-x-auto">
          <svg
            width={width} height={CHART_H + 18} viewBox={`0 0 ${width} ${CHART_H + 18}`}
            role="group" aria-label={t.forecastLabel} className="block max-w-none"
          >
            {forecast.map((count, i) => {
              const h = Math.round((count / max) * CHART_H);
              const x = i * (BAR_W + BAR_GAP);
              return (
                <g key={i}>
                  <rect x={x} y={CHART_H - h} width={BAR_W} height={h} rx={2} className="fill-accent-600">
                    <title>{t.forecastBar(forecastLabels[i], count)}</title>
                  </rect>
                  {count > 0 && (
                    <text x={x + BAR_W / 2} y={CHART_H - h - 3} textAnchor="middle" fontSize="9" className="fill-slate-700 dark:fill-slate-300">
                      {count}
                    </text>
                  )}
                  <text x={x + BAR_W / 2} y={CHART_H + 12} textAnchor="middle" fontSize="9" className="fill-slate-600 dark:fill-slate-400">
                    {i === 0 ? '0' : `+${i}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>
    </div>
  );
}
