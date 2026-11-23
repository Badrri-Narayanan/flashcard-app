import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { useLibrary } from '../hooks/useLibrary';
import { strings } from '../strings';
import AllCaughtUp from './AllCaughtUp';
import { ALL_SCOPE_ID } from './useStudyScope';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium';
const NO_UPCOMING_UNTIL = Number.MAX_SAFE_INTEGER - 1;

export default function StudyHome() {
  const { ready, decks, dueCounts } = useLibrary();
  const deckIds = decks.map((d) => d.id).join(',');
  const nextDueAt = useLiveQuery(async () => {
    if (!deckIds) return null;
    const upcoming = await repo.getDueItems(deckIds.split(','), NO_UPCOMING_UNTIL, 1);
    return upcoming.length > 0 ? Math.max(Date.now(), upcoming[0].due) : null;
  }, [deckIds]);

  if (!ready) return <p className="p-8 text-center">{strings.common.loading}</p>;
  const totalDue = decks.reduce((sum, d) => sum + (dueCounts[d.id]?.due ?? 0), 0);
  const totalNew = decks.reduce((sum, d) => sum + (dueCounts[d.id]?.new ?? 0), 0);
  if (decks.length === 0) return <p className="p-8 text-center">{strings.study.noDecks}</p>;
  if (totalDue + totalNew === 0) return <AllCaughtUp nextDueAt={nextDueAt ?? null} backTo="/" />;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{strings.study.homeTitle}</h1>
        <Link to={`/study/folder/${ALL_SCOPE_ID}/learn`} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
          {strings.study.studyAll}
        </Link>
      </div>
      <ul className="space-y-2">
        {decks.map((d) => {
          const counts = dueCounts[d.id] ?? { due: 0, new: 0 };
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{`${d.emoji} ${d.name}`}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {strings.library.due(counts.due)} · {strings.library.new(counts.new)}
                </p>
              </div>
              <Link
                to={`/study/deck/${d.id}/learn`}
                aria-label={strings.study.studyDeck(d.name)}
                className={`${button} bg-accent-600 text-white hover:bg-accent-700`}
              >
                {strings.nav.study}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
