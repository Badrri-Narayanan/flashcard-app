import { useDailyProgress } from '../hooks/useDailyProgress';
import { strings } from '../strings';

const R = 16;
const C = 2 * Math.PI * R;

export default function GoalRing() {
  const progress = useDailyProgress(false);
  if (!progress) return null;
  const { today, goal } = progress;
  const fraction = goal > 0 ? Math.min(1, today / goal) : 0;
  return (
    <div role="img" aria-label={strings.goal.label(today, goal)} className="flex items-center gap-2">
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden>
        <circle cx="20" cy="20" r={R} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx="20" cy="20" r={R} fill="none" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} transform="rotate(-90 20 20)"
          className="stroke-accent-600"
        />
      </svg>
      <span aria-hidden className="text-sm font-medium tabular-nums">{today}/{goal}</span>
    </div>
  );
}
