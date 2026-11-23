import { Link } from 'react-router-dom';
import { strings } from '../strings';

const outline = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

export default function StudyNotice({ text, backTo }: { text: string; backTo: string }) {
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <p>{text}</p>
      <Link to={backTo} className={outline}>
        {strings.study.back}
      </Link>
    </section>
  );
}
