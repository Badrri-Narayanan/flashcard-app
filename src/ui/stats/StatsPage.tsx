import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { repo } from '../../data/repo';
import { calibration, overconfidentCards } from '../../domain/calibration';
import { addDays, dailyCounts, deckBreakdown, forecast, heatmap, retentionLogs, streak } from '../../domain/stats';
import { dayKey } from '../../domain/day';
import type { Id } from '../../domain/types';
import { useStudyDayNow } from '../hooks/useStudyDayNow';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import CalibrationChart from './CalibrationChart';
import DeckStats from './DeckStats';
import Heatmap from './Heatmap';

const DAY_MS = 86_400_000;
const FORECAST_DAYS = 14;

export default function StatsPage() {
  const [{ dailyGoal, dayStartHour }] = useSettings();
  const [selected, setSelected] = useState<Id | 'all'>('all');
  const t = strings.stats;
  const studyDay = useStudyDayNow(dayStartHour);

  const data = useLiveQuery(async () => {
    const now = Date.now();
    const [logs, decks, cards] = await Promise.all([
      repo.listLogs({ from: now - 366 * DAY_MS, to: now }),
      repo.listDecks(),
      repo.listAllCards(),
    ]);
    const items = await repo.listReviewItems(decks.map((d) => d.id));
    const recentLearn = logs.filter((l) => l.mode === 'learn' && l.at >= now - 30 * DAY_MS);
    const firstLearn = await repo.getFirstLearnLogTimes([...new Set(recentLearn.map((l) => l.reviewItemId))]);
    return { now, logs, decks, cards, items, retention: retentionLogs(recentLearn, firstLearn, now) };
  }, [studyDay]);

  const view = useMemo(() => {
    if (!data) return null;
    const { now, logs, decks, cards, items, retention } = data;
    const today = dayKey(now, dayStartHour);
    const counts = dailyCounts(logs);
    const inDeck = <T extends { deckId: Id }>(rows: T[]) => (selected === 'all' ? rows : rows.filter((r) => r.deckId === selected));
    const deckItems = inDeck(items);
    const deckCards = inDeck(cards);
    const suspended = new Set(deckCards.filter((c) => c.suspended).map((c) => c.id));
    const cardById = new Map(cards.map((c) => [c.id, c]));
    return {
      decks,
      today,
      streak: streak(counts, today, dailyGoal),
      cells: heatmap(counts, today),
      breakdown: deckBreakdown(deckItems, deckCards, inDeck(retention)),
      forecast: forecast(deckItems.filter((i) => !suspended.has(i.cardId)), now, FORECAST_DAYS, dayStartHour),
      calibration: calibration(logs),
      overconfident: overconfidentCards(logs)
        .map((id) => cardById.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined && c.deletedAt === null),
    };
  }, [data, selected, dailyGoal, dayStartHour]);

  const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900';
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      {!view && <p>{t.loading}</p>}
      {view && (
        <>
          <section aria-labelledby="streak-heading" className={card}>
            <h2 id="streak-heading" className="text-lg font-semibold">{t.streakHeading}</h2>
            <p className="text-3xl font-bold">{t.currentStreak(view.streak.current)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t.bestStreak(view.streak.best)} · {view.streak.freezeUsedThisWeek ? t.freezeUsed : t.freezeAvailable}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t.goalNote(dailyGoal)}</p>
          </section>
          <section aria-labelledby="heatmap-heading" className={card}>
            <h2 id="heatmap-heading" className="text-lg font-semibold">{t.heatmapHeading}</h2>
            <Heatmap cells={view.cells} />
          </section>
          <section aria-labelledby="deck-heading" className={card}>
            <h2 id="deck-heading" className="text-lg font-semibold">{t.deckHeading}</h2>
            {view.decks.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">{t.noDecks}</p>
            ) : (
              <DeckStats
                decks={view.decks}
                selected={selected}
                onSelect={setSelected}
                breakdown={view.breakdown}
                forecast={view.forecast}
                forecastLabels={view.forecast.map((_, i) => (i === 0 ? t.forecastToday : addDays(view.today, i)))}
              />
            )}
          </section>
          <section aria-labelledby="calibration-heading" className={card}>
            <h2 id="calibration-heading" className="text-lg font-semibold">{t.calibrationHeading}</h2>
            <CalibrationChart rows={view.calibration} overconfidentCards={view.overconfident} />
          </section>
        </>
      )}
    </div>
  );
}
