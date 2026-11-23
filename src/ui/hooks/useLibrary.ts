import { useLiveQuery } from 'dexie-react-hooks';
import { useContext, useMemo } from 'react';
import { repo } from '../../data/repo';
import { buildTree, descendantDeckIds, type TreeNode } from '../../domain/tree';
import { endOfStudyDay } from '../../domain/day';
import type { Deck, Folder, Id } from '../../domain/types';
import { DEFAULT_SETTINGS, SettingsContext } from '../settings/settings';

export type DueCounts = Record<Id, { due: number; new: number }>;

interface Snapshot {
  folders: Folder[];
  decks: Deck[];
  dueCounts: DueCounts;
}

const EMPTY_FOLDERS: Folder[] = [];
const EMPTY_DECKS: Deck[] = [];
const EMPTY_TREE: TreeNode[] = [];
const EMPTY_COUNTS: DueCounts = {};

async function load(dayStartHour: number): Promise<Snapshot> {
  const [folders, decks] = await Promise.all([repo.listFolders(), repo.listDecks()]);
  const until = endOfStudyDay(Date.now(), dayStartHour);
  const counts = await Promise.all(decks.map((d) => repo.countDue(d.id, until)));
  const dueCounts: DueCounts = {};
  decks.forEach((d, i) => {
    dueCounts[d.id] = counts[i];
  });
  for (const f of folders) {
    let due = 0;
    let fresh = 0;
    for (const id of descendantDeckIds(f.id, folders, decks)) {
      due += dueCounts[id].due;
      fresh += dueCounts[id].new;
    }
    dueCounts[f.id] = { due, new: fresh };
  }
  return { folders, decks, dueCounts };
}

export function useLibrary() {
  const dayStartHour = (useContext(SettingsContext)?.[0] ?? DEFAULT_SETTINGS).dayStartHour;
  const snapshot = useLiveQuery(() => load(dayStartHour), [dayStartHour]);
  const folders = snapshot?.folders ?? EMPTY_FOLDERS;
  const decks = snapshot?.decks ?? EMPTY_DECKS;
  const tree = useMemo(() => (snapshot ? buildTree(folders, decks) : EMPTY_TREE), [snapshot, folders, decks]);
  return {
    ready: snapshot !== undefined,
    tree,
    folders,
    decks,
    dueCounts: snapshot?.dueCounts ?? EMPTY_COUNTS,
  };
}
