import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { descendantDeckIds } from '../../domain/tree';
import { useLibrary } from '../hooks/useLibrary';
import { strings } from '../strings';
import AllCaughtUp from './AllCaughtUp';
import ModePicker from './ModePicker';
import { ALL_SCOPE_ID } from './useStudyScope';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium';
const NO_UPCOMING_UNTIL = Number.MAX_SAFE_INTEGER - 1;

export default function StudyHome() {
  const { ready, folders, decks, dueCounts } = useLibrary();
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
  const caughtUp = totalDue + totalNew === 0;
  const studyFolders = folders.filter((f) => descendantDeckIds(f.id, folders, decks).length > 0);

  const row = (scope: 'deck' | 'folder', e: { id: string; emoji: string; name: string }) => {
    const counts = dueCounts[e.id] ?? { due: 0, new: 0 };
    return (
      <li key={e.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <p className="truncate font-medium">{`${e.emoji} ${e.name}`}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {strings.library.due(counts.due)} · {strings.library.new(counts.new)}
          </p>
        </div>
        <ModePicker scope={scope} id={e.id} name={e.name} />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {caughtUp ? (
        <AllCaughtUp nextDueAt={nextDueAt ?? null} backTo="/" />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{strings.study.homeTitle}</h1>
          <Link to={`/study/folder/${ALL_SCOPE_ID}/learn`} className={`${button} bg-accent-600 text-white hover:bg-accent-700`}>
            {strings.study.studyAll}
          </Link>
        </div>
      )}
      {studyFolders.length > 0 && (
        <section aria-labelledby="study-folders" className="space-y-2">
          <h2 id="study-folders" className="text-lg font-semibold">{strings.study.foldersHeading}</h2>
          <ul className="space-y-2">{studyFolders.map((f) => row('folder', f))}</ul>
        </section>
      )}
      <section aria-labelledby="study-decks" className="space-y-2">
        <h2 id="study-decks" className="text-lg font-semibold">{strings.study.decksHeading}</h2>
        <ul className="space-y-2">{decks.map((d) => row('deck', d))}</ul>
      </section>
    </div>
  );
}
