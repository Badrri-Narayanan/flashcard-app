import { describe, it, expect } from 'vitest';
import { buildTree, descendantDeckIds, wouldCreateCycle } from '../../src/domain/tree';
import { DEFAULT_DECK_SETTINGS, type Deck, type Folder } from '../../src/domain/types';

function folder(id: string, parentId: string | null, over: Partial<Folder> = {}): Folder {
  return {
    id, parentId, name: id, description: '', color: 'red', emoji: '📁', order: 0,
    createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
  };
}

function deck(id: string, folderId: string | null, over: Partial<Deck> = {}): Deck {
  return {
    id, folderId, name: id, description: '', color: 'blue', emoji: '🃏', order: 0,
    settings: DEFAULT_DECK_SETTINGS, sourceId: null, matchBestMs: null,
    createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
  };
}

describe('buildTree', () => {
  it('builds a nested 3-level tree', () => {
    const folders = [folder('a', null), folder('b', 'a'), folder('c', 'b')];
    const decks = [deck('d1', 'c'), deck('d2', null)];
    const tree = buildTree(folders, decks);
    expect(tree.map((n) => n.id)).toEqual(['a', 'd2']);
    const b = tree[0].children[0];
    expect(b.id).toBe('b');
    const c = b.children[0];
    expect(c.id).toBe('c');
    expect(c.children).toEqual([
      { kind: 'deck', id: 'd1', name: 'd1', emoji: '🃏', color: 'blue', children: [] },
    ]);
    expect(tree[0]).toMatchObject({ kind: 'folder', emoji: '📁', color: 'red' });
  });

  it('puts folders before decks and sorts by order then name case-insensitively', () => {
    const folders = [
      folder('f3', null, { name: 'beta', order: 1 }),
      folder('f1', null, { name: 'Zed', order: 0 }),
      folder('f2', null, { name: 'alpha', order: 1 }),
    ];
    const decks = [deck('d1', null, { name: 'A', order: 0 }), deck('d2', null, { name: 'b', order: 0 })];
    expect(buildTree(folders, decks).map((n) => n.id)).toEqual(['f1', 'f2', 'f3', 'd1', 'd2']);
  });

  it('ignores deleted records and sends orphans to root', () => {
    const folders = [
      folder('a', null, { deletedAt: 5 }),
      folder('b', 'a'),
      folder('c', 'missing'),
    ];
    const decks = [deck('d1', 'a'), deck('d2', 'nope'), deck('d3', 'b', { deletedAt: 1 })];
    const tree = buildTree(folders, decks);
    expect(tree.map((n) => n.id).sort()).toEqual(['b', 'c', 'd1', 'd2']);
    expect(tree.find((n) => n.id === 'b')!.children).toEqual([]);
  });

  it('does not loop on parent cycles; cyclic folders go to root', () => {
    const folders = [folder('a', 'b'), folder('b', 'a'), folder('c', 'a'), folder('s', 's')];
    const tree = buildTree(folders, [deck('d', 'a')]);
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'b', 's']);
    const a = tree.find((n) => n.id === 'a')!;
    expect(a.children.map((n) => n.id)).toEqual(['c', 'd']);
  });
});

describe('descendantDeckIds', () => {
  const folders = [folder('a', null), folder('b', 'a'), folder('c', 'b'), folder('x', null)];
  const decks = [
    deck('d1', 'a'), deck('d2', 'b'), deck('d3', 'c'), deck('d4', 'x'),
    deck('d5', 'c', { deletedAt: 1 }), deck('d6', null),
  ];

  it('returns decks at all depths excluding deleted', () => {
    expect(descendantDeckIds('a', folders, decks).sort()).toEqual(['d1', 'd2', 'd3']);
    expect(descendantDeckIds('c', folders, decks)).toEqual(['d3']);
  });

  it('skips deleted folders and survives cycles', () => {
    const f = [folder('a', 'b'), folder('b', 'a'), folder('z', 'a', { deletedAt: 1 })];
    const d = [deck('d1', 'b'), deck('d2', 'z')];
    expect(descendantDeckIds('a', f, d)).toEqual(['d1']);
  });
});

describe('wouldCreateCycle', () => {
  const folders = [folder('a', null), folder('b', 'a'), folder('c', 'b'), folder('x', null)];

  it('detects self and descendant parents', () => {
    expect(wouldCreateCycle('a', 'a', folders)).toBe(true);
    expect(wouldCreateCycle('a', 'b', folders)).toBe(true);
    expect(wouldCreateCycle('a', 'c', folders)).toBe(true);
  });

  it('allows safe moves and null parent', () => {
    expect(wouldCreateCycle('c', 'a', folders)).toBe(false);
    expect(wouldCreateCycle('a', 'x', folders)).toBe(false);
    expect(wouldCreateCycle('a', null, folders)).toBe(false);
  });
});
