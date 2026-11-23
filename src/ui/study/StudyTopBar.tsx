import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { strings } from '../strings';

interface Props {
  backTo: string;
  done: number;
  total: number;
  onHelp(): void;
  children?: ReactNode;
}

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-full text-lg hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800';

export default function StudyTopBar({ backTo, done, total, onHelp, children }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <header className="flex items-center gap-2">
      <Link to={backTo} aria-label={strings.study.exit} className={iconButton}>
        ✕
      </Link>
      <div
        role="progressbar"
        aria-label={strings.study.progress}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={strings.study.progressText(done, total)}
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div className="h-full bg-accent-600 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {children}
      <button type="button" onClick={onHelp} aria-label={strings.study.help} className={iconButton}>
        ?
      </button>
    </header>
  );
}
