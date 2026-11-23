import { useEffect, useState } from 'react';
import { repo } from '../../data/repo';
import { descendantDeckIds } from '../../domain/tree';
import type { Id } from '../../domain/types';

export type ScopeKind = 'deck' | 'folder';

export type ResolvedScope =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; deckIds: Id[]; backTo: string };

export const ALL_SCOPE_ID = 'all';

/** Resolves `/study/:scope/:id` to deck ids; folder `all` means every deck. */
export function useStudyScope(scope: string | undefined, id: string | undefined): ResolvedScope {
  const [result, setResult] = useState<{ key: string; value: ResolvedScope } | null>(null);
  const key = `${scope}/${id}`;

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<ResolvedScope> => {
      if (!id || (scope !== 'deck' && scope !== 'folder')) return { status: 'missing' };
      if (scope === 'deck') {
        const deck = await repo.getDeck(id);
        return deck && deck.deletedAt === null
          ? { status: 'ready', deckIds: [id], backTo: `/deck/${id}` }
          : { status: 'missing' };
      }
      const [folders, decks] = await Promise.all([repo.listFolders(), repo.listDecks()]);
      if (id === ALL_SCOPE_ID) return { status: 'ready', deckIds: decks.map((d) => d.id), backTo: '/study' };
      if (!folders.some((f) => f.id === id)) return { status: 'missing' };
      return { status: 'ready', deckIds: descendantDeckIds(id, folders, decks), backTo: `/folder/${id}` };
    })()
      .catch((err: unknown): ResolvedScope => {
        console.error('Failed to resolve study scope', err);
        return { status: 'missing' };
      })
      .then((value) => {
        if (!cancelled) setResult({ key, value });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, id, key]);

  return result && result.key === key ? result.value : { status: 'loading' };
}
