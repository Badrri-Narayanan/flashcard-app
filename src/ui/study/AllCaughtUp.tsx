import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatInterval } from '../../domain/scheduler';
import { strings } from '../strings';

interface Props {
  nextDueAt: number | null;
  backTo?: string;
  cramHref?: string;
  limitReached?: boolean;
  onStudyMore?: () => void;
}

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium';

export default function AllCaughtUp({ nextDueAt, backTo, cramHref, limitReached, onStudyMore }: Props) {
  const [now] = useState(Date.now);
  const s = strings.study;
  let next: string | null = null;
  if (nextDueAt !== null) next = nextDueAt - now < 60_000 ? s.nextDueNow : s.nextDue(formatInterval(nextDueAt - now));
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{limitReached ? s.limitReached : s.caughtUp}</h1>
      <p className="text-slate-600 dark:text-slate-400">{limitReached ? s.limitReachedBody : s.caughtUpBody}</p>
      {next && !limitReached && <p className="font-medium">{next}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {onStudyMore && (
          <button type="button" onClick={onStudyMore} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
            {strings.study.summary.studyMore}
          </button>
        )}
        {cramHref && (
          <Link to={cramHref} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
            {s.cramAnyway}
          </Link>
        )}
        {backTo && (
          <Link to={backTo} className={`${button} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}>
            {s.back}
          </Link>
        )}
      </div>
    </section>
  );
}
