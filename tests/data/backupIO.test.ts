import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyImport, exportBackup, readBackupFile } from '../../src/data/backupIO';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { planImport, validateBackup } from '../../src/domain/backup';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder, Media, ReviewItem, ReviewLog } from '../../src/domain/types';

const folder = (over: Partial<Folder> = {}): Folder => ({
  ...baseRecord(), parentId: null, name: 'F', description: '', color: '', emoji: '', order: 0, ...over,
});
const deck = (over: Partial<Deck> = {}): Deck => ({
  ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
});
const card = (deckId: string, over: Partial<Card> = {}): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
});

// fake-indexeddb's structured clone flattens Blobs to plain objects, so real bytes are tracked here
// and swapped back in when the repository is asked for media (browsers keep Blobs intact).
const realBlobs = new Map<string, Blob>();
const imported: Media[] = [];

async function seed() {
  const f = folder();
  const d = deck({ folderId: f.id });
  const mediaId = 'media-1';
  const c = card(d.id, { front: `pic media:${mediaId}`, tags: ['t'] });
  const item: ReviewItem = {
    ...baseRecord(), cardId: c.id, deckId: d.id, variant: 'fwd', due: 5, stability: 3, difficulty: 4,
    elapsedDays: 1, scheduledDays: 2, reps: 2, lapses: 1, state: 2, lastReview: 4,
  };
  const log: ReviewLog = {
    ...baseRecord(), reviewItemId: item.id, cardId: c.id, deckId: d.id, mode: 'learn', rating: 3, correct: true,
    confidence: null, durationMs: 10, at: 7, dayKey: '2026-01-01',
  };
  const m: Media = { ...baseRecord(), id: mediaId, blob: new Blob([new Uint8Array([1, 2, 3, 255])], { type: 'image/png' }), mime: 'image/png', width: 2, height: 3 };
  await repo.saveFolder(f);
  await repo.saveDeck(d);
  await repo.saveCard(c);
  await db.reviewItems.clear();
  await db.reviewItems.put(item);
  await db.reviewLogs.put(log);
  await repo.putMedia(m);
  realBlobs.set(m.id, m.blob);
  return { f, d, c: (await db.cards.get(c.id))!, item, log, m };
}

async function counts() {
  return Promise.all(db.tables.map(async (t) => [t.name, await t.count()] as const));
}

async function blobBytes(b: Blob): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve([...new Uint8Array(r.result as ArrayBuffer)]);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

function text(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

async function parse(blob: Blob) {
  const v = validateBackup(JSON.parse(await text(blob)));
  if (!v.ok) throw new Error(v.error);
  return v.file;
}

const asFile = (text: string) => new File([text], 'b.json', { type: 'application/json' });
const existingMeta = () => repo.getExistingMeta();

beforeEach(async () => {
  vi.restoreAllMocks();
  realBlobs.clear();
  imported.length = 0;
  const listMedia = repo.listMedia.bind(repo);
  vi.spyOn(repo, 'listMedia').mockImplementation(async (ids) =>
    (await listMedia(ids)).map((m) => ({ ...m, blob: realBlobs.get(m.id) ?? m.blob })),
  );
  const importRecords = repo.importRecords.bind(repo);
  vi.spyOn(repo, 'importRecords').mockImplementation((put) => {
    imported.push(...(put.media ?? []));
    return importRecords(put);
  });
  await db.delete();
  await db.open();
});

describe('backupIO', () => {
  it('round-trip export→import into empty db reproduces records and media bytes', async () => {
    const s = await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    await db.delete();
    await db.open();
    const file = await readBackupFile(asFile(await text(blob)));
    await applyImport(planImport(file, await existingMeta(), 'update', null));
    expect(await db.folders.get(s.f.id)).toEqual(s.f);
    expect(await db.decks.get(s.d.id)).toEqual(s.d);
    expect(await db.cards.get(s.c.id)).toEqual(s.c);
    expect(await db.reviewItems.toArray()).toEqual([s.item]);
    expect(await db.reviewLogs.toArray()).toEqual([s.log]);
    expect(await db.media.get('media-1')).toMatchObject({ mime: 'image/png', width: 2, height: 3 });
    expect(imported).toHaveLength(1);
    expect(imported[0].blob.type).toBe('image/png');
    expect(await blobBytes(imported[0].blob)).toEqual([1, 2, 3, 255]);
  });

  it('update mode keeps local newer card', async () => {
    const s = await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    await db.cards.put({ ...s.c, front: 'local edit', updatedAt: s.c.updatedAt + 1000 });
    const file = await readBackupFile(asFile(await text(blob)));
    await applyImport(planImport(file, await existingMeta(), 'update', null));
    expect((await db.cards.get(s.c.id))!.front).toBe('local edit');
  });

  it('update mode applies newer fields but keeps locally moved folders and decks in place', async () => {
    const s = await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    const elsewhere = folder();
    await repo.saveFolder(elsewhere);
    // Local copy is older but was moved; the file copy (exported earlier) must lose on placement only.
    await db.decks.put({ ...s.d, folderId: elsewhere.id, updatedAt: s.d.updatedAt - 10, name: 'old name' });
    await db.folders.put({ ...s.f, parentId: elsewhere.id, updatedAt: s.f.updatedAt - 10, name: 'old' });
    const file = await readBackupFile(asFile(await text(blob)));
    await applyImport(planImport(file, await existingMeta(), 'update', null));
    expect(await db.decks.get(s.d.id)).toMatchObject({ name: s.d.name, folderId: elsewhere.id });
    expect(await db.folders.get(s.f.id)).toMatchObject({ name: s.f.name, parentId: elsewhere.id });
  });

  it('update mode never overwrites local review items', async () => {
    const s = await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    await db.reviewItems.put({ ...s.item, reps: 99 });
    const file = await readBackupFile(asFile(await text(blob)));
    await applyImport(planImport(file, await existingMeta(), 'update', null));
    expect((await db.reviewItems.get(s.item.id))!.reps).toBe(99);
  });

  it('copy mode remaps ids and media refs consistently', async () => {
    const s = await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    const file = await readBackupFile(asFile(await text(blob)));
    await applyImport(planImport(file, await existingMeta(), 'copy', null));
    expect(await db.cards.count()).toBe(2);
    const copy = (await db.cards.toArray()).find((c) => c.id !== s.c.id)!;
    const mediaIds = (await db.media.toArray()).map((m) => m.id);
    expect(mediaIds).toHaveLength(2);
    const newMedia = mediaIds.find((id) => id !== 'media-1')!;
    expect(copy.front).toBe(`pic media:${newMedia}`);
    const copyDeck = (await db.decks.toArray()).find((d) => d.id !== s.d.id)!;
    expect(copy.deckId).toBe(copyDeck.id);
    const copyItems = await db.reviewItems.where('cardId').equals(copy.id).toArray();
    expect(copyItems).toHaveLength(1);
    expect(copyItems[0].reps).toBe(2);
  });

  it('creates fresh review items for imported cards when the backup has no history', async () => {
    const s = await seed();
    const blob = await exportBackup('deck', s.d.id, { includeHistory: false });
    const exported = await parse(blob);
    expect(exported.reviewItems).toBeUndefined();
    await db.delete();
    await db.open();
    await applyImport(planImport(exported, await existingMeta(), 'update', null));
    const items = await db.reviewItems.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cardId: s.c.id, state: 0, variant: 'fwd' });
  });

  it('export excludes soft-deleted records and scopes folders to their subtree', async () => {
    const s = await seed();
    const sub = folder({ parentId: s.f.id });
    const subDeck = deck({ folderId: sub.id });
    const other = deck();
    const gone = card(s.d.id, { deletedAt: 5 });
    await repo.saveFolder(sub);
    await repo.saveDeck(subDeck);
    await repo.saveDeck(other);
    await db.cards.put(gone);
    const f = await parse(await exportBackup('folder', s.f.id, { includeHistory: false }));
    expect(f.folders.map((x) => x.id).sort()).toEqual([s.f.id, sub.id].sort());
    expect(f.decks.map((x) => x.id).sort()).toEqual([s.d.id, subDeck.id].sort());
    expect(f.cards.map((x) => x.id)).toEqual([s.c.id]);
    expect(f.media.map((x) => x.id)).toEqual(['media-1']);
    expect(f.scope).toBe('folder');
  });

  it('library export stamps lastBackupAt without clobbering other settings', async () => {
    await repo.setKV('settings', { theme: 'dark', lastBackupAt: null });
    await exportBackup('library', null, { includeHistory: false });
    const stored = await repo.getKV<{ theme: string; lastBackupAt: number }>('settings');
    expect(stored?.theme).toBe('dark');
    expect(stored?.lastBackupAt).toBeGreaterThan(0);
    await repo.setKV('settings', { lastBackupAt: null });
    const s = await seed();
    await exportBackup('deck', s.d.id, { includeHistory: false });
    expect((await repo.getKV<{ lastBackupAt: number | null }>('settings'))?.lastBackupAt).toBeNull();
  });

  it('rejects malformed JSON without writing', async () => {
    await seed();
    const blob = await exportBackup('library', null, { includeHistory: true });
    const raw = await text(blob);
    const before = await counts();
    await expect(readBackupFile(asFile(raw.slice(0, raw.length - 20)))).rejects.toThrow(/valid|JSON|corrupt/i);
    expect(await counts()).toEqual(before);
  });

  it("rejects schemaVersion 99 with 'made by a newer version' message", async () => {
    await expect(
      readBackupFile(asFile(JSON.stringify({ app: 'flashcards', schemaVersion: 99, exportedAt: 1, scope: 'library', folders: [], decks: [], cards: [], media: [] }))),
    ).rejects.toThrow('made by a newer version');
  });

  it('rejects files over 300 MB before reading them', async () => {
    const big = { size: 301 * 1024 * 1024, text: () => { throw new Error('should not read'); } } as unknown as File;
    await expect(readBackupFile(big)).rejects.toThrow(/too large/i);
  });

  it('applyImport is all-or-nothing', async () => {
    const d = deck();
    const bad = { ...card(d.id), id: undefined } as unknown as Card;
    const plan = planImport({ app: 'flashcards', schemaVersion: 1, exportedAt: 1, scope: 'deck', folders: [], decks: [d], cards: [bad], media: [] }, await existingMeta(), 'update', null);
    await expect(applyImport(plan)).rejects.toThrow();
    expect(await db.decks.count()).toBe(0);
  });
});
