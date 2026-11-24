import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from '../../data/repo';
import { dayKey, startOfStudyDay } from '../../domain/day';
import { dailyCounts, streak, type Streak } from '../../domain/stats';
import { useSettings } from '../settings/settings';

const DAY_MS = 86_400_000;

export interface DailyProgress {
  /** Reviews logged so far in the current study day, across all modes. */
  today: number;
  goal: number;
  /** Only present when requested; needs a year of logs. */
  streak?: Streak;
}

/** Cheap range query over the `at` index: today only, or the last 366 days when the streak is wanted. */
export function useDailyProgress(withStreak: boolean): DailyProgress | undefined {
  const [{ dailyGoal, dayStartHour }] = useSettings();
  return useLiveQuery(async () => {
    const now = Date.now();
    const from = withStreak ? now - 366 * DAY_MS : startOfStudyDay(now, dayStartHour);
    const counts = dailyCounts(await repo.listLogs({ from, to: now }));
    const todayKey = dayKey(now, dayStartHour);
    return {
      today: counts.get(todayKey) ?? 0,
      goal: dailyGoal,
      ...(withStreak ? { streak: streak(counts, todayKey, dailyGoal) } : {}),
    };
  }, [withStreak, dailyGoal, dayStartHour]);
}
