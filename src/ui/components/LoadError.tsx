import { Link } from 'react-router-dom';
import { strings } from '../strings';

const outline = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

/** Shown when a page could not read its cards, so a failure never looks like an empty deck. */
export default function LoadError({ onRetry, backTo }: { onRetry: () => void; backTo?: string }) {
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <p role="alert">{strings.common.loadFailed}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700">
          {strings.common.tryAgain}
        </button>
        {backTo && (
          <Link to={backTo} className={outline}>
            {strings.study.back}
          </Link>
        )}
      </div>
    </section>
  );
}
