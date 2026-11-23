import { Link } from 'react-router-dom';
import { strings } from '../strings';

export default function ComingSoonPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{strings.comingSoon.title}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{strings.comingSoon.body}</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700"
      >
        {strings.common.goHome}
      </Link>
    </section>
  );
}
