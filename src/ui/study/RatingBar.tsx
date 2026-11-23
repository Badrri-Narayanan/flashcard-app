import type { Rating } from '../../domain/types';
import { strings } from '../strings';

interface Props {
  intervals: Record<Rating, string>;
  onRate(rating: Rating): void;
  showHints: boolean;
}

const RATINGS: Rating[] = [1, 2, 3, 4];
const TONE: Record<Rating, string> = {
  1: 'bg-rose-600 hover:bg-rose-700',
  2: 'bg-amber-600 hover:bg-amber-700',
  3: 'bg-emerald-600 hover:bg-emerald-700',
  4: 'bg-sky-600 hover:bg-sky-700',
};

export default function RatingBar({ intervals, onRate, showHints }: Props) {
  return (
    <div role="group" aria-label={strings.study.rateLabel} className="grid grid-cols-4 gap-2">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRate(r)}
          className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-1 text-white ${TONE[r]}`}
        >
          <span className="font-semibold">{strings.study.ratings[r]}</span>
          <span className="text-xs opacity-90">{intervals[r]}</span>
          {showHints && (
            <kbd aria-hidden className="mt-0.5 rounded bg-white/20 px-1.5 text-xs">
              {r}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}
