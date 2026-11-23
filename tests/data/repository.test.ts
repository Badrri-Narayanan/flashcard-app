import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { DexieRepository } from '../../src/data/dexieRepository';
import { StorageFullError } from '../../src/data/repository';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder } from '../../src/domain/types';

const repo = new DexieRepository(db);

function mkFolder(over: Partial<Folder> = {}): Folder {
  return { ...baseRecord(), parentId: null, name: 'F', description: '', color: '', emoji: '', order: 0, ...over };
}
function mkDeck(over: Partial<Deck> = {}): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
});

describe('DexieRepository', () => {
  it('saveCard reversible creates fwd and rev items with state 0', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id, { type: 'reversible' });
    await repo.saveCard(card);
    const items = await db.reviewItems.where('cardId').equals(card.id).toArray();
    expect(items.map((i) => i.variant).sort()).toEqual(['fwd', 'rev']);
    expect(items.every((i) => i.state === 0 && i.deckId === deck.id)).toBe(true);
  });

  it('editing cloze from c1,c2 to c2,c3 keeps c2 progress, soft-deletes c1, adds c3', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id, { type: 'cloze', front: '{{c1::a}} {{c2::b}}' });
    await repo.saveCard(card);
    const c2 = await db.reviewItems.where('cardId').equals(card.id).filter((i) => i.variant === 'c2').first();
    await db.reviewItems.update(c2!.id, { reps: 5, state: 2 });
    await repo.saveCard({ ...card, front: '{{c2::b}} {{c3::c}}' });
    const items = await db.reviewItems.where('cardId').equals(card.id).toArray();
    const by = (v: string) => items.filter((i) => i.variant === v);
    expect(by('c2')).toHaveLength(1);
    expect(by('c2')[0]).toMatchObject({ id: c2!.id, reps: 5, deletedAt: null });
    expect(by('c1')[0].deletedAt).not.toBeNull();
    expect(by('c3')[0]).toMatchObject({ deletedAt: null, state: 0 });
  });

  it('deleteFolder cascades soft-delete to nested folders, decks, cards; restoreFolder undoes', async () => {
    const parent = mkFolder();
    const child = mkFolder({ parentId: parent.id });
    await repo.saveFolder(parent);
    await repo.saveFolder(child);
    const deck = mkDeck({ folderId: child.id });
    await repo.saveDeck(deck);
    const card = mkCard(deck.id);
    await repo.saveCard(card);
    const earlier = mkCard(deck.id);
    await repo.saveCard(earlier);
    await repo.deleteCards([earlier.id]);

    await repo.deleteFolder(parent.id, { cascade: true });
    expect(await repo.listFolders()).toHaveLength(0);
    expect(await repo.listDecks()).toHaveLength(0);
    expect(await repo.listCards(deck.id)).toHaveLength(0);
    expect(await db.reviewItems.filter((i) => i.deletedAt === null).count()).toBe(0);

    await repo.restoreFolder(parent.id);
    expect((await repo.listFolders()).map((f) => f.id).sort()).toEqual([parent.id, child.id].sort());
    expect(await repo.listDecks()).toHaveLength(1);
    expect((await repo.listCards(deck.id)).map((c) => c.id)).toEqual([card.id]);
    expect(await db.reviewItems.where('cardId').equals(card.id).filter((i) => i.deletedAt === null).count()).toBe(1);
    expect(await db.reviewItems.where('cardId').equals(earlier.id).filter((i) => i.deletedAt === null).count()).toBe(0);
  });

  it('countDue uses due <= until and excludes suspended cards and deleted items', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const a = mkCard(deck.id);
    const b = mkCard(deck.id);
    const s = mkCard(deck.id);
    const d = mkCard(deck.id);
    const f = mkCard(deck.id);
    for (const c of [a, b, s, d, f]) await repo.saveCard(c);
    const itemOf = async (id: string) => (await db.reviewItems.where('cardId').equals(id).first())!;
    await db.reviewItems.update((await itemOf(a.id)).id, { state: 2, due: 1000 });
    await db.reviewItems.update((await itemOf(b.id)).id, { state: 2, due: 2001 });
    await db.reviewItems.update((await itemOf(d.id)).id, { state: 2, due: 500 });
    await repo.deleteCards([d.id]);
    await db.reviewItems.update((await itemOf(f.id)).id, { state: 2, due: 2000 });
    await repo.saveCard({ ...s, suspended: true });
    expect(await repo.countDue(deck.id, 2000)).toEqual({ due: 2, new: 0 });
    // s is suspended and new: not counted as new either
    const c = mkCard(deck.id);
    await repo.saveCard(c);
    expect(await repo.countDue(deck.id, 2000)).toEqual({ due: 2, new: 1 });
    await repo.saveCard({ ...s, suspended: false });
    expect((await repo.countDue(deck.id, 2000)).new).toBe(2);
  });

  it('getDueItems and getNewItems order and limit', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const cards = [mkCard(deck.id), mkCard(deck.id), mkCard(deck.id)];
    for (const c of cards) await repo.saveCard(c);
    const items = await db.reviewItems.toArray();
    await db.reviewItems.update(items[0].id, { state: 2, due: 30 });
    await db.reviewItems.update(items[1].id, { state: 2, due: 10 });
    const due = await repo.getDueItems([deck.id], 100, 5);
    expect(due.map((i) => i.due)).toEqual([10, 30]);
    expect(await repo.getDueItems([deck.id], 100, 1)).toHaveLength(1);
    expect(await repo.getNewItems([deck.id], 5)).toHaveLength(1);
  });

  it('duplicateDeck copies cards with fresh items and " (copy)" suffix', async () => {
    const deck = mkDeck({ name: 'Spanish' });
    await repo.saveDeck(deck);
    const card = mkCard(deck.id, { type: 'reversible' });
    await repo.saveCard(card);
    const copy = await repo.duplicateDeck(deck.id);
    expect(copy.name).toBe('Spanish (copy)');
    expect(copy.id).not.toBe(deck.id);
    const cards = await repo.listCards(copy.id);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).not.toBe(card.id);
    const items = await db.reviewItems.where('deckId').equals(copy.id).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.state === 0 && i.cardId === cards[0].id)).toBe(true);
  });

  it('saveReview, listLogs, media and kv round trip', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id);
    await repo.saveCard(card);
    const item = (await db.reviewItems.toArray())[0];
    const log = {
      ...baseRecord(), reviewItemId: item.id, cardId: card.id, deckId: deck.id, mode: 'learn' as const,
      rating: 3 as const, correct: true, confidence: null, durationMs: 1, at: 500, dayKey: '2026-01-01',
    };
    await repo.saveReview({ ...item, reps: 1 }, log);
    expect((await db.reviewItems.get(item.id))!.reps).toBe(1);
    expect(await repo.listLogs({ from: 400, to: 600 })).toHaveLength(1);
    expect(await repo.listLogs({ from: 501, to: 600 })).toHaveLength(0);
    expect(await repo.listLogs(undefined, ['other'])).toHaveLength(0);
    await repo.saveReview(null, { ...log, id: 'x2' });
    expect(await repo.listLogs()).toHaveLength(2);

    const m = { ...baseRecord(), blob: new Blob(['x']), mime: 'image/png', width: 1, height: 1 };
    await repo.putMedia(m);
    expect((await repo.getMedia(m.id))!.mime).toBe('image/png');
    await repo.setKV('k', { a: 1 });
    expect(await repo.getKV('k')).toEqual({ a: 1 });
    expect(await repo.getKV('missing')).toBeUndefined();
  });

  it('moveDeck and moveFolder update parent', async () => {
    const f = mkFolder();
    await repo.saveFolder(f);
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.moveDeck(deck.id, f.id);
    expect((await repo.getDeck(deck.id))!.folderId).toBe(f.id);
    const g = mkFolder();
    await repo.saveFolder(g);
    await repo.moveFolder(g.id, f.id);
    expect((await repo.listFolders()).find((x) => x.id === g.id)!.parentId).toBe(f.id);
  });

  it('repository surfaces QuotaExceededError as StorageFullError', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    vi.spyOn(db.cards, 'put').mockRejectedValue(new DOMException('', 'QuotaExceededError'));
    await expect(repo.saveCard(mkCard(deck.id))).rejects.toBeInstanceOf(StorageFullError);
  });

  it('suspend sets due to MAX_SAFE_INTEGER and unsuspend restores due to now()', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id);
    await repo.saveCard(card);
    await repo.saveCard({ ...card, suspended: true });
    const item = (await db.reviewItems.where('cardId').equals(card.id).first())!;
    expect(item.due).toBe(Number.MAX_SAFE_INTEGER);
    expect(await repo.countDue(deck.id, Number.MAX_SAFE_INTEGER - 1)).toEqual({ due: 0, new: 0 });
    const before = Date.now();
    await repo.saveCard({ ...card, suspended: false });
    const after = (await db.reviewItems.get(item.id))!;
    expect(after.due).toBeGreaterThanOrEqual(before);
    expect(after.due).toBeLessThanOrEqual(Date.now());
    expect((await repo.countDue(deck.id, Date.now())).new).toBe(1);
  });

  it('moving a card to another deck updates its items deckId', async () => {
    const d1 = mkDeck();
    const d2 = mkDeck();
    await repo.saveDeck(d1);
    await repo.saveDeck(d2);
    const card = mkCard(d1.id, { type: 'reversible' });
    await repo.saveCard(card);
    await repo.saveCard({ ...card, deckId: d2.id });
    const items = await db.reviewItems.where('cardId').equals(card.id).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.deckId === d2.id)).toBe(true);
  });

  it('wraps QuotaExceededError found on err.inner', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const wrapped = Object.assign(new Error('wrapped'), { inner: new DOMException('', 'QuotaExceededError') });
    vi.spyOn(db.cards, 'put').mockRejectedValue(wrapped);
    const err = await repo.saveCard(mkCard(deck.id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageFullError);
    expect((err as StorageFullError).cause).toBe(wrapped);
  });

  it('getDueItems and getNewItems apply limit across decks', async () => {
    const d1 = mkDeck();
    const d2 = mkDeck();
    await repo.saveDeck(d1);
    await repo.saveDeck(d2);
    for (let n = 0; n < 3; n++) {
      await repo.saveCard(mkCard(d1.id));
      await repo.saveCard(mkCard(d2.id));
    }
    expect(await repo.getNewItems([d1.id, d2.id], 4)).toHaveLength(4);
    expect(await repo.getNewItems([d1.id], 2)).toHaveLength(2);
  });
});
