import Dexie from 'dexie';
import { baseRecord, now, touch } from '../domain/ids';
import { newReviewItem } from '../domain/scheduler';
import { reconcileVariants } from '../domain/variants';
import type {
  Card,
  Deck,
  Folder,
  Id,
  Media,
  ReviewItem,
  ReviewLog,
  Variant,
} from '../domain/types';
import type { FlashcardDB } from './db';
import type { ExistingMeta } from '../domain/backup';
import { StorageFullError, type ImportRecords, type Repository } from './repository';

const SUSPENDED_DUE = Number.MAX_SAFE_INTEGER;

function createReviewItem(card: Card, variant: Variant): ReviewItem {
  return newReviewItem(card.id, card.deckId, variant, card.suspended);
}

function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; inner?: { name?: string } } | null;
  return e?.name === 'QuotaExceededError' || e?.inner?.name === 'QuotaExceededError';
}

let lastStamp = 0;
/** Strictly increasing timestamp so cascade-delete stamps never collide with earlier deletes. */
function deleteStamp(): number {
  lastStamp = Math.max(now(), lastStamp + 1);
  return lastStamp;
}

const isLive = (r: { deletedAt: number | null }) => r.deletedAt === null;

export class DexieRepository implements Repository {
  constructor(private readonly db: FlashcardDB) {}

  private async write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isQuotaError(err)) throw new StorageFullError(undefined, { cause: err });
      throw err;
    }
  }

  // folders
  async listFolders(): Promise<Folder[]> {
    return (await this.db.folders.toArray()).filter(isLive);
  }

  saveFolder(f: Folder): Promise<void> {
    return this.write(async () => {
      await this.db.folders.put(f);
    });
  }

  moveFolder(id: Id, parentId: Id | null): Promise<void> {
    return this.write(async () => {
      await this.db.folders.update(id, { parentId, updatedAt: now() });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- cascade is the only supported mode
  deleteFolder(id: Id, _opts: { cascade: true }): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.folders, this.db.decks, this.db.cards, this.db.reviewItems], async () => {
        const t = deleteStamp();
        const all = await this.db.folders.toArray();
        const ids = this.subtree(all.filter(isLive), id);
        await this.cascadeDelete(ids, t);
      }),
    );
  }

  restoreFolder(id: Id): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.folders, this.db.decks, this.db.cards, this.db.reviewItems], async () => {
        const root = await this.db.folders.get(id);
        if (!root || root.deletedAt === null) return;
        const t = root.deletedAt;
        const all = await this.db.folders.toArray();
        const ids = this.subtree(
          all.filter((f) => f.deletedAt === t),
          id,
        );
        await this.cascadeRestore(ids, t);
      }),
    );
  }

  private subtree(folders: Folder[], rootId: Id): Id[] {
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) {
      for (const f of folders) if (f.parentId === ids[i] && !ids.includes(f.id)) ids.push(f.id);
    }
    return ids;
  }

  private async cascadeDelete(folderIds: Id[], t: number): Promise<void> {
    const folders = (await this.db.folders.bulkGet(folderIds)).filter((f): f is Folder => !!f && isLive(f));
    await this.db.folders.bulkPut(folders.map((f) => ({ ...f, deletedAt: t })));
    const decks = (await this.db.decks.where('folderId').anyOf(folderIds).toArray()).filter(isLive);
    for (const d of decks) await this.deleteDeckTx(d.id, t);
  }

  private async cascadeRestore(folderIds: Id[], t: number): Promise<void> {
    const folders = (await this.db.folders.bulkGet(folderIds)).filter((f): f is Folder => !!f && f.deletedAt === t);
    await this.db.folders.bulkPut(folders.map((f) => ({ ...f, deletedAt: null })));
    const decks = (await this.db.decks.where('folderId').anyOf(folderIds).toArray()).filter((d) => d.deletedAt === t);
    for (const d of decks) await this.restoreDeckTx(d.id, t);
  }

  // decks
  async listDecks(): Promise<Deck[]> {
    return (await this.db.decks.toArray()).filter(isLive);
  }

  async getDeck(id: Id): Promise<Deck | undefined> {
    return this.db.decks.get(id);
  }

  saveDeck(d: Deck): Promise<void> {
    return this.write(async () => {
      await this.db.decks.put(d);
    });
  }

  moveDeck(id: Id, folderId: Id | null): Promise<void> {
    return this.write(async () => {
      await this.db.decks.update(id, { folderId, updatedAt: now() });
    });
  }

  deleteDeck(id: Id): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.decks, this.db.cards, this.db.reviewItems], () =>
        this.deleteDeckTx(id, deleteStamp()),
      ),
    );
  }

  restoreDeck(id: Id): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.decks, this.db.cards, this.db.reviewItems], async () => {
        const deck = await this.db.decks.get(id);
        if (!deck || deck.deletedAt === null) return;
        await this.restoreDeckTx(id, deck.deletedAt);
      }),
    );
  }

  private async deleteDeckTx(id: Id, t: number): Promise<void> {
    const deck = await this.db.decks.get(id);
    if (deck && isLive(deck)) await this.db.decks.put({ ...deck, deletedAt: t });
    const cards = (await this.db.cards.where('deckId').equals(id).toArray()).filter(isLive);
    await this.db.cards.bulkPut(cards.map((c) => ({ ...c, deletedAt: t })));
    const items = (await this.db.reviewItems.where('deckId').equals(id).toArray()).filter(isLive);
    await this.db.reviewItems.bulkPut(items.map((i) => ({ ...i, deletedAt: t })));
  }

  private async restoreDeckTx(id: Id, t: number): Promise<void> {
    const deck = await this.db.decks.get(id);
    if (deck && deck.deletedAt === t) await this.db.decks.put({ ...deck, deletedAt: null });
    const cards = (await this.db.cards.where('deckId').equals(id).toArray()).filter((c) => c.deletedAt === t);
    await this.db.cards.bulkPut(cards.map((c) => ({ ...c, deletedAt: null })));
    const items = (await this.db.reviewItems.where('deckId').equals(id).toArray()).filter((i) => i.deletedAt === t);
    await this.db.reviewItems.bulkPut(items.map((i) => ({ ...i, deletedAt: null })));
  }

  duplicateDeck(id: Id): Promise<Deck> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.decks, this.db.cards, this.db.reviewItems], async () => {
        const source = await this.db.decks.get(id);
        if (!source || !isLive(source)) throw new Error(`Deck not found: ${id}`);
        const copy: Deck = {
          ...source,
          ...baseRecord(),
          name: `${source.name} (copy)`,
          settings: { ...source.settings },
          matchBestMs: null,
        };
        await this.db.decks.put(copy);
        const cards = (await this.db.cards.where('deckId').equals(id).toArray()).filter(isLive);
        for (const c of cards) {
          await this.saveCardTx({ ...c, ...baseRecord(), deckId: copy.id, tags: [...c.tags], distractors: [...c.distractors] });
        }
        return copy;
      }),
    );
  }

  // cards
  async listCards(deckId: Id): Promise<Card[]> {
    return (await this.db.cards.where('deckId').equals(deckId).toArray()).filter(isLive);
  }

  async listAllCards(): Promise<Card[]> {
    return (await this.db.cards.toArray()).filter(isLive);
  }

  async countCards(): Promise<number> {
    // null is not indexable, so live = all rows minus rows with a numeric deletedAt.
    const [all, deleted] = await Promise.all([this.db.cards.count(), this.db.cards.where('deletedAt').above(0).count()]);
    return all - deleted;
  }

  async getCard(id: Id): Promise<Card | undefined> {
    return this.db.cards.get(id);
  }

  saveCard(card: Card): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.cards, this.db.reviewItems], () => this.saveCardTx(card)),
    );
  }

  saveCards(cards: Card[]): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.cards, this.db.reviewItems], async () => {
        for (const c of cards) await this.saveCardTx(c);
      }),
    );
  }

  private async saveCardTx(input: Card): Promise<void> {
    const card = touch(input);
    const stored = await this.db.cards.get(card.id);
    const prevType = stored && isLive(stored) ? stored.type : card.type;
    const existing = await this.db.reviewItems.where('cardId').equals(card.id).toArray();
    const { keep, remove, add } = reconcileVariants(existing, card, prevType);
    const t = now();

    await this.db.cards.put(card);
    const updates: ReviewItem[] = remove.map((i) => ({ ...i, deletedAt: deleteStamp() }));
    for (const i of keep) {
      let due = i.due;
      if (card.suspended) due = SUSPENDED_DUE;
      else if (i.due === SUSPENDED_DUE) due = t;
      if (due !== i.due || i.deckId !== card.deckId) updates.push({ ...i, due, deckId: card.deckId });
    }
    for (const v of add) updates.push(createReviewItem(card, v));
    if (updates.length > 0) await this.db.reviewItems.bulkPut(updates);
  }

  deleteCards(ids: Id[]): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.cards, this.db.reviewItems], async () => {
        const t = deleteStamp();
        const cards = (await this.db.cards.bulkGet(ids)).filter((c): c is Card => !!c && isLive(c));
        await this.db.cards.bulkPut(cards.map((c) => ({ ...c, deletedAt: t })));
        const items = (await this.db.reviewItems.where('cardId').anyOf(cards.map((c) => c.id)).toArray()).filter(isLive);
        await this.db.reviewItems.bulkPut(items.map((i) => ({ ...i, deletedAt: t })));
      }),
    );
  }

  restoreCards(ids: Id[]): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.cards, this.db.reviewItems], async () => {
        const cards = (await this.db.cards.bulkGet(ids)).filter((c): c is Card => !!c && !isLive(c));
        const stamps = new Map(cards.map((c) => [c.id, c.deletedAt]));
        await this.db.cards.bulkPut(cards.map((c) => ({ ...c, deletedAt: null })));
        const items = (await this.db.reviewItems.where('cardId').anyOf(cards.map((c) => c.id)).toArray()).filter(
          (i) => i.deletedAt !== null && i.deletedAt === stamps.get(i.cardId),
        );
        await this.db.reviewItems.bulkPut(items.map((i) => ({ ...i, deletedAt: null })));
      }),
    );
  }

  // review
  async getDueItems(deckIds: Id[], until: number, limit: number): Promise<ReviewItem[]> {
    const found: ReviewItem[] = [];
    for (const deckId of deckIds) {
      const items = await this.db.reviewItems
        .where('[deckId+due]')
        .between([deckId, Dexie.minKey], [deckId, until], true, true)
        .filter((i) => i.state !== 0 && isLive(i))
        .limit(limit)
        .toArray();
      found.push(...items);
    }
    return found.sort((a, b) => a.due - b.due).slice(0, limit);
  }

  async getNewItems(deckIds: Id[], limit: number): Promise<ReviewItem[]> {
    const found: ReviewItem[] = [];
    for (const deckId of deckIds) {
      const items = await this.db.reviewItems
        .where('[deckId+due]')
        .between([deckId, Dexie.minKey], [deckId, SUSPENDED_DUE], true, false)
        .filter((i) => i.state === 0 && isLive(i))
        .limit(limit)
        .toArray();
      found.push(...items);
    }
    return found.sort((a, b) => a.due - b.due).slice(0, limit);
  }

  async countDue(deckId: Id, until: number): Promise<{ due: number; new: number }> {
    const due = await this.db.reviewItems
      .where('[deckId+due]')
      .between([deckId, Dexie.minKey], [deckId, until], true, true)
      .filter((i) => i.state !== 0 && isLive(i))
      .count();
    const fresh = await this.db.reviewItems
      .where('[deckId+due]')
      .between([deckId, Dexie.minKey], [deckId, SUSPENDED_DUE], true, false)
      .filter((i) => i.state === 0 && isLive(i))
      .count();
    return { due, new: fresh };
  }

  saveReview(item: ReviewItem | null, log: ReviewLog): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', [this.db.reviewItems, this.db.reviewLogs], async () => {
        if (item) await this.db.reviewItems.put(item);
        await this.db.reviewLogs.put(log);
      }),
    );
  }

  saveReviewItems(items: ReviewItem[]): Promise<void> {
    return this.write(async () => {
      await this.db.reviewItems.bulkPut(items);
    });
  }

  async listLogs(range?: { from: number; to: number }, deckIds?: Id[]): Promise<ReviewLog[]> {
    const decks = deckIds ? new Set(deckIds) : null;
    const logs = range
      ? await this.db.reviewLogs.where('at').between(range.from, range.to, true, true).toArray()
      : deckIds
        ? await this.db.reviewLogs.where('deckId').anyOf(deckIds).toArray()
        : await this.db.reviewLogs.toArray();
    return logs.filter((l) => isLive(l) && (!decks || decks.has(l.deckId)));
  }

  async listLogsForCard(cardId: Id, limit: number): Promise<ReviewLog[]> {
    const logs = (await this.db.reviewLogs.where('cardId').equals(cardId).toArray()).filter(isLive);
    return logs.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async getFirstLearnLogTimes(reviewItemIds: Id[]): Promise<Map<Id, number>> {
    const logs = await this.db.reviewLogs.where('reviewItemId').anyOf(reviewItemIds).toArray();
    const first = new Map<Id, number>();
    for (const l of logs) {
      if (!isLive(l) || l.mode !== 'learn') continue;
      const prev = first.get(l.reviewItemId);
      if (prev === undefined || l.at < prev) first.set(l.reviewItemId, l.at);
    }
    return first;
  }

  deleteLog(id: Id): Promise<void> {
    return this.write(async () => {
      await this.db.reviewLogs.update(id, { deletedAt: now() });
    });
  }

  // media
  async getReviewItemsForCard(cardId: Id): Promise<ReviewItem[]> {
    return (await this.db.reviewItems.where('cardId').equals(cardId).toArray()).filter(isLive);
  }

  putMedia(m: Media): Promise<void> {
    return this.write(async () => {
      await this.db.media.put(m);
    });
  }

  async getMedia(id: Id): Promise<Media | undefined> {
    return this.db.media.get(id);
  }

  // import / export
  async listReviewItems(deckIds: Id[]): Promise<ReviewItem[]> {
    return (await this.db.reviewItems.where('deckId').anyOf(deckIds).toArray()).filter(isLive);
  }

  async listMedia(ids: Id[]): Promise<Media[]> {
    return (await this.db.media.bulkGet(ids)).filter((m): m is Media => !!m && isLive(m));
  }

  async getExistingMeta(): Promise<ExistingMeta> {
    const ids = new Set<Id>();
    const updatedAt = new Map<Id, number>();
    const placement = new Map<Id, Id | null>();
    for (const table of [this.db.folders, this.db.decks, this.db.cards, this.db.reviewItems, this.db.reviewLogs, this.db.media]) {
      await table.each((r) => {
        ids.add(r.id);
        updatedAt.set(r.id, r.updatedAt);
      });
    }
    await this.db.folders.each((f) => placement.set(f.id, f.parentId));
    await this.db.decks.each((d) => placement.set(d.id, d.folderId));
    return { ids, updatedAt, placement };
  }

  importRecords(put: Partial<ImportRecords>): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', this.db.tables, async () => {
        if (put.folders?.length) await this.db.folders.bulkPut(put.folders);
        if (put.decks?.length) await this.db.decks.bulkPut(put.decks);
        if (put.cards?.length) await this.db.cards.bulkPut(put.cards);
        if (put.reviewItems?.length) await this.db.reviewItems.bulkPut(put.reviewItems);
        if (put.reviewLogs?.length) await this.db.reviewLogs.bulkPut(put.reviewLogs);
        if (put.media?.length) await this.db.media.bulkPut(put.media);
      }),
    );
  }

  // kv
  async getKV<T>(key: string): Promise<T | undefined> {
    return (await this.db.kv.get(key))?.value as T | undefined;
  }

  setKV(key: string, value: unknown): Promise<void> {
    return this.write(async () => {
      await this.db.kv.put({ key, value });
    });
  }

  resetAll(): Promise<void> {
    return this.write(() =>
      this.db.transaction('rw', this.db.tables, async () => {
        for (const table of this.db.tables) await table.clear();
      }),
    );
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.write(() => this.db.transaction('rw', this.db.tables, fn));
  }
}
