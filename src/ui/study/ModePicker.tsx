import { Link } from 'react-router-dom';
import { strings } from '../strings';

const MODES = ['learn', 'cram', 'quiz', 'type', 'match'] as const;

interface Props {
  scope: 'deck' | 'folder';
  id: string;
  name: string;
}

/** Segmented links to every study mode for one deck or folder. */
export default function ModePicker({ scope, id, name }: Props) {
  return (
    <nav aria-label={strings.study.modes.label(name)} className="flex gap-1">
      {MODES.map((mode) => (
        <Link
          key={mode}
          to={`/study/${scope}/${id}/${mode}`}
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-1 text-sm font-medium ${
            mode === 'learn'
              ? 'bg-accent-600 text-white hover:bg-accent-700'
              : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
          }`}
        >
          {strings.study.modes[mode]}
        </Link>
      ))}
    </nav>
  );
}
