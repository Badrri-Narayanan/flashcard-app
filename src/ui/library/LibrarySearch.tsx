import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { SearchIndex } from '../../domain/search';
import type { Deck } from '../../domain/types';
import { strings } from '../strings';

interface Props {
  decks: Deck[];
}

interface Loaded {
  index: SearchIndex;
  tags: string[];
}

export default function LibrarySearch({ decks }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const started = useRef(false);

  function buildIndex() {
    if (started.current) return;
    started.current = true;
    repo
      .listAllCards()
      .then((cards) => {
        const tags = [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b));
        setLoaded({ index: new SearchIndex(cards), tags });
      })
      .catch((err: unknown) => {
        started.current = false;
        console.error('Failed to build search index', err);
      });
  }

  const active = query.trim() !== '' || tag !== '';
  const results = useMemo(
    () => (loaded && active ? loaded.index.search(query, { tag: tag || undefined }) : []),
    [loaded, active, query, tag],
  );
  const deckNames = useMemo(() => new Map(decks.map((d) => [d.id, d.name])), [decks]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="search"
          role="searchbox"
          aria-label={strings.search.label}
          placeholder={strings.search.placeholder}
          value={query}
          onFocus={buildIndex}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
        {loaded && loaded.tags.length > 0 && (
          <select
            aria-label={strings.search.tag}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="min-h-11 max-w-[40%] rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">{strings.search.allTags}</option>
            {loaded.tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>
      {active && loaded && (
        <ul aria-label={strings.search.results} className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
          {results.length === 0 && <li className="px-4 py-3 text-slate-600 dark:text-slate-400">{strings.search.noResults}</li>}
          {results.map((c) => (
            <li key={c.id}>
              <Link to={`/deck/${c.deckId}/edit/${c.id}`} className="block min-h-11 px-4 py-2">
                <span dir="auto" className="line-clamp-1 font-medium">{c.front}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {strings.search.inDeck(deckNames.get(c.deckId) ?? strings.search.unknownDeck)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
