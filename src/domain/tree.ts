import type { Deck, Folder, Id } from './types';

export interface TreeNode {
  kind: 'folder' | 'deck';
  id: Id;
  name: string;
  emoji: string;
  color: string;
  children: TreeNode[];
}

interface Sortable {
  order: number;
  name: string;
}

function compare(a: Sortable, b: Sortable): number {
  return a.order - b.order || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function liveFolders(folders: Folder[]): Folder[] {
  return folders.filter((f) => f.deletedAt === null);
}

function inCycle(folder: Folder, byId: Map<Id, Folder>): boolean {
  const seen = new Set<Id>([folder.id]);
  let parentId = folder.parentId;
  while (parentId !== null) {
    if (parentId === folder.id) return true;
    const parent = byId.get(parentId);
    if (!parent || seen.has(parentId)) return false;
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return false;
}

export function buildTree(folders: Folder[], decks: Deck[]): TreeNode[] {
  const live = liveFolders(folders);
  const byId = new Map(live.map((f) => [f.id, f]));
  const folderNodes = new Map<Id, TreeNode>();
  for (const f of live) {
    folderNodes.set(f.id, { kind: 'folder', id: f.id, name: f.name, emoji: f.emoji, color: f.color, children: [] });
  }

  const root: TreeNode[] = [];
  const childrenOf = (parentId: Id | null, cyclic: boolean): TreeNode[] =>
    parentId !== null && !cyclic && folderNodes.has(parentId) ? folderNodes.get(parentId)!.children : root;

  for (const f of [...live].sort(compare)) {
    childrenOf(f.parentId, inCycle(f, byId)).push(folderNodes.get(f.id)!);
  }
  for (const d of decks.filter((x) => x.deletedAt === null).sort(compare)) {
    childrenOf(d.folderId, false).push({
      kind: 'deck', id: d.id, name: d.name, emoji: d.emoji, color: d.color, children: [],
    });
  }
  return root;
}

export function descendantDeckIds(folderId: Id, folders: Folder[], decks: Deck[]): Id[] {
  const live = liveFolders(folders);
  const inScope = new Set<Id>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of live) {
      if (!inScope.has(f.id) && f.parentId !== null && inScope.has(f.parentId)) {
        inScope.add(f.id);
        grew = true;
      }
    }
  }
  return decks
    .filter((d) => d.deletedAt === null && d.folderId !== null && inScope.has(d.folderId))
    .map((d) => d.id);
}

export function wouldCreateCycle(folderId: Id, newParentId: Id | null, folders: Folder[]): boolean {
  if (newParentId === null) return false;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<Id>();
  let current: Id | null = newParentId;
  while (current !== null && !seen.has(current)) {
    if (current === folderId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}
