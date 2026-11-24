import {
  SCHEMA_VERSION,
  bytesToBase64,
  validateBackup,
  type BackupFile,
  type BackupMedia,
  type BackupScope,
  type MergePlan,
} from '../domain/backup';
import { newReviewItem } from '../domain/scheduler';
import { descendantDeckIds } from '../domain/tree';
import { variantsFor } from '../domain/variants';
import type { Card, Deck, Folder, Id, ReviewItem } from '../domain/types';
import { repo } from './repo';

export const MAX_BACKUP_BYTES = 300 * 1024 * 1024;
const SETTINGS_KEY = 'settings';
const LAST_BACKUP_KEY = 'lastBackupAt';
const MEDIA_REF = /media:([\w-]+)/g;

function readAs<T extends string | ArrayBuffer>(read: (r: FileReader) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as T);
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
    read(r);
  });
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await readAs<ArrayBuffer>((r) => r.readAsArrayBuffer(blob)));
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return readAs<string>((r) => r.readAsText(blob));
}

function mediaIdsIn(card: Card): Id[] {
  const ids: Id[] = [];
  for (const text of [card.front, card.back, card.mnemonic, ...card.distractors]) {
    for (const m of text.matchAll(MEDIA_REF)) ids.push(m[1]);
  }
  return ids;
}

function folderSubtree(rootId: Id, folders: Folder[]): Folder[] {
  const ids = new Set<Id>([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (!ids.has(f.id) && f.parentId !== null && ids.has(f.parentId)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return folders.filter((f) => ids.has(f.id));
}

async function stampLibraryBackup(at: number): Promise<void> {
  await repo.setKV(LAST_BACKUP_KEY, at);
}

/** When the whole library was last exported; falls back to the value older versions kept inside the settings blob. */
export async function getLastBackupAt(): Promise<number | null> {
  const own = await repo.getKV<number>(LAST_BACKUP_KEY);
  if (typeof own === 'number') return own;
  const legacy = (await repo.getKV<{ lastBackupAt?: number | null }>(SETTINGS_KEY))?.lastBackupAt;
  return typeof legacy === 'number' ? legacy : null;
}

/** Builds the backup as string parts, one deck (and one media item) at a time, so no giant string is ever held. */
export async function exportBackup(scope: BackupScope, id: Id | null, opts: { includeHistory: boolean }): Promise<Blob> {
  const allFolders = await repo.listFolders();
  const allDecks = await repo.listDecks();
  let folders: Folder[];
  let decks: Deck[];
  if (scope === 'library') {
    folders = allFolders;
    decks = allDecks;
  } else if (scope === 'folder') {
    if (!id || !allFolders.some((f) => f.id === id)) throw new Error('Folder not found.');
    folders = folderSubtree(id, allFolders);
    const deckIds = new Set(descendantDeckIds(id, allFolders, allDecks));
    decks = allDecks.filter((d) => deckIds.has(d.id));
  } else {
    const deck = allDecks.find((d) => d.id === id);
    if (!deck) throw new Error('Deck not found.');
    folders = [];
    decks = [deck];
  }

  const exportedAt = Date.now();
  const parts: string[] = [
    `{"app":"flashcards","schemaVersion":${SCHEMA_VERSION},"exportedAt":${exportedAt},"scope":${JSON.stringify(scope)},` +
      `"folders":${JSON.stringify(folders)},"decks":${JSON.stringify(decks)},"cards":[`,
  ];
  const mediaIds = new Set<Id>();
  let first = true;
  const emit = (records: unknown[]) => {
    if (records.length === 0) return;
    parts.push((first ? '' : ',') + records.map((r) => JSON.stringify(r)).join(','));
    first = false;
  };

  for (const d of decks) {
    const cards = await repo.listCards(d.id);
    for (const c of cards) for (const m of mediaIdsIn(c)) mediaIds.add(m);
    emit(cards);
  }
  parts.push(']');

  if (opts.includeHistory) {
    first = true;
    parts.push(',"reviewItems":[');
    for (const d of decks) emit(await repo.listReviewItems([d.id]));
    parts.push('],"reviewLogs":[');
    first = true;
    for (const d of decks) emit(await repo.listLogs(undefined, [d.id]));
    parts.push(']');
  }

  parts.push(',"media":[');
  first = true;
  for (const mid of mediaIds) {
    const [m] = await repo.listMedia([mid]);
    if (!m) continue;
    const dataBase64 = bytesToBase64(await blobBytes(m.blob));
    emit([{ id: m.id, mime: m.mime, width: m.width, height: m.height, dataBase64 }]);
  }
  parts.push(']}');

  const blob = new Blob(parts, { type: 'application/json' });
  if (scope === 'library' && opts.includeHistory) await stampLibraryBackup(exportedAt);
  return blob;
}

/** Base64 media referenced by the cards, keyed by id; ids with no stored image are simply absent. */
export async function loadBackupMedia(
  cards: Card[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<Id, BackupMedia>> {
  const ids = [...new Set(cards.flatMap(mediaIdsIn))];
  const out = new Map<Id, BackupMedia>();
  let done = 0;
  for (const id of ids) {
    // Yield between images so the page stays responsive and progress can paint.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    onProgress?.(done++, ids.length);
    const [m] = await repo.listMedia([id]);
    if (m) out.set(id, { id: m.id, mime: m.mime, width: m.width, height: m.height, dataBase64: bytesToBase64(await blobBytes(m.blob)) });
  }
  return out;
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('This file is too large to import (limit 300 MB).');
  const text = await blobText(file);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON; it may be damaged or incomplete.');
  }
  const result = validateBackup(raw);
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

/** All-or-nothing: writes the plan, then gives any imported card with no live review items fresh ones. */
export function applyImport(plan: MergePlan): Promise<void> {
  return repo.transaction(async () => {
    await repo.importRecords(plan.put);
    const created: ReviewItem[] = [];
    for (const card of plan.put.cards) {
      if (card.deletedAt !== null) continue;
      if ((await repo.getReviewItemsForCard(card.id)).length > 0) continue;
      for (const v of variantsFor(card)) created.push(newReviewItem(card.id, card.deckId, v, card.suspended));
    }
    await repo.importRecords({ reviewItems: created });
  });
}
