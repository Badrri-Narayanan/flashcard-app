import { Link } from 'react-router-dom';
import { useDailyProgress } from '../hooks/useDailyProgress';
import { strings } from '../strings';
import { formatDuration } from './format';

interface Props {
  studied: number;
  /** Whole-number percentage, 0-100. */
  accuracy: number;
  timeMs: number;
  backTo: string;
  onStudyMore?: () => void;
  onUndo?: () => void;
}

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium';

export default function SessionSummary({ studied, accuracy, timeMs, backTo, onStudyMore, onUndo }: Props) {
  const s = strings.study.summary;
  const progress = useDailyProgress(true);
  const streakText = progress?.streak
    ? progress.streak.current > 0 ? s.streak(progress.streak.current) : s.noStreak
    : null;
  const goalText = progress
    ? progress.today >= progress.goal ? s.goalMet : s.goalRemaining(progress.goal - progress.today)
    : null;
  const stats: [string, string][] = [
    [s.studied, String(studied)],
    [s.accuracy, `${accuracy}%`],
    [s.time, formatDuration(timeMs)],
  ];
  return (
    <section className="mx-auto max-w-md space-y-6 px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{s.title}</h1>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {streakText && goalText && (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{streakText}</span> · {goalText}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {onStudyMore && (
          <button type="button" onClick={onStudyMore} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
            {s.studyMore}
          </button>
        )}
        {onUndo && (
          <button type="button" onClick={onUndo} className={`${button} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}>
            {strings.study.undoLabel}
          </button>
        )}
        <Link to={backTo} className={`${button} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}>
          {s.backToDeck}
        </Link>
      </div>
    </section>
  );
}
