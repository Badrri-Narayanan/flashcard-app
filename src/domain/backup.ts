import { newId, now } from './ids';
import type { Card, Deck, Folder, Id, Media, ReviewItem, ReviewLog } from './types';

export const SCHEMA_VERSION = 1;

export type BackupScope = 'library' | 'folder' | 'deck';
const SCOPES: readonly string[] = ['library', 'folder', 'deck'];

export interface BackupMedia {
  id: Id;
  mime: string;
  width: number;
  height: number;
  dataBase64: string;
}

export interface BackupFile {
  app: 'flashcards';
  schemaVersion: number;
  exportedAt: number;
  scope: BackupScope;
  folders: Folder[];
  decks: Deck[];
  cards: Card[];
  reviewItems?: ReviewItem[];
  reviewLogs?: ReviewLog[];
  media: BackupMedia[];
}

export type BackupValidation = { ok: true; file: BackupFile } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function recordsError(name: string, v: unknown, required: boolean): string | null {
  if (v === undefined && !required) return null;
  if (!Array.isArray(v)) return `The backup is missing its "${name}" list.`;
  if (!v.every((r) => isObject(r) && typeof r.id === 'string')) return `The backup has a malformed entry in "${name}".`;
  return null;
}

export function validateBackup(raw: unknown): BackupValidation {
  if (!isObject(raw)) return { ok: false, error: 'This file is not a flashcards backup.' };
  if (raw.app !== 'flashcards') return { ok: false, error: 'This file is not a flashcards backup.' };
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    return { ok: false, error: 'The backup has an invalid version number.' };
  }
  if (raw.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' };
  }
  if (typeof raw.exportedAt !== 'number') return { ok: false, error: 'The backup has no export date.' };
  if (typeof raw.scope !== 'string' || !SCOPES.includes(raw.scope)) return { ok: false, error: 'The backup has an invalid scope.' };
  const error =
    recordsError('folders', raw.folders, true) ??
    recordsError('decks', raw.decks, true) ??
    recordsError('cards', raw.cards, true) ??
    recordsError('reviewItems', raw.reviewItems, false) ??
    recordsError('reviewLogs', raw.reviewLogs, false) ??
    recordsError('media', raw.media, true);
  if (error) return { ok: false, error };
  const media = raw.media as Record<string, unknown>[];
  if (!media.every((m) => typeof m.dataBase64 === 'string' && typeof m.mime === 'string')) {
    return { ok: false, error: 'The backup has a malformed entry in "media".' };
  }
  return { ok: true, file: raw as unknown as BackupFile };
}

export type MergeMode = 'update' | 'copy';

export interface ExistingMeta {
  ids: Set<Id>;
  updatedAt: Map<Id, number>;
  /** Local parentId (folders) / folderId (decks), so updates never move a record. */
  placement?: Map<Id, Id | null>;
}

export interface MergePlan {
  put: {
    folders: Folder[];
    decks: Deck[];
    cards: Card[];
    reviewItems: ReviewItem[];
    reviewLogs: ReviewLog[];
    media: Media[];
  };
  /** Counts folders, decks and cards only. */
  summary: { added: number; updated: number; skipped: number };
}

const BASE64_CHUNK = 0x6000; // multiple of 3 and 4-aligned output; keeps String.fromCharCode args small

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    let bin = '';
    const end = Math.min(i + BASE64_CHUNK, bytes.length);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
    parts.push(btoa(bin));
  }
  return parts.join('');
}

const BASE64_DECODE_CHUNK = 0x8000; // multiple of 4

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0));
  let pos = 0;
  for (let i = 0; i < clean.length; i += BASE64_DECODE_CHUNK) {
    const bin = atob(clean.slice(i, i + BASE64_DECODE_CHUNK));
    for (let j = 0; j < bin.length; j++) out[pos++] = bin.charCodeAt(j);
  }
  return out;
}

function toMedia(m: BackupMedia, id: Id): Media {
  const t = now();
  const bytes = base64ToBytes(m.dataBase64);
  return {
    id, createdAt: t, updatedAt: t, deletedAt: null, mime: m.mime, width: m.width, height: m.height,
    blob: new Blob([bytes as BlobPart], { type: m.mime }),
  };
}

const MEDIA_REF = /media:([\w-]+)/g;

function remapText(text: string, map: Map<Id, Id>): string {
  return text.replace(MEDIA_REF, (whole, id: string) => (map.has(id) ? `media:${map.get(id)}` : whole));
}

function planCopy(file: BackupFile, targetFolderId: Id | null): MergePlan {
  const map = new Map<Id, Id>();
  const remap = (id: Id): Id => {
    let n = map.get(id);
    if (!n) {
      n = newId();
      map.set(id, n);
    }
    return n;
  };
  const to = (id: Id): Id => map.get(id) ?? id;
  const folderIds = new Set(file.folders.map((f) => f.id));
  for (const r of [...file.folders, ...file.decks, ...file.cards, ...(file.reviewItems ?? []), ...(file.reviewLogs ?? []), ...file.media]) {
    remap(r.id);
  }
  const folders = file.folders.map((f) => ({
    ...f, id: to(f.id), parentId: f.parentId !== null && folderIds.has(f.parentId) ? to(f.parentId) : targetFolderId,
  }));
  const decks = file.decks.map((d) => ({
    ...d, id: to(d.id), folderId: d.folderId !== null && folderIds.has(d.folderId) ? to(d.folderId) : targetFolderId,
    sourceId: d.sourceId === null ? null : to(d.sourceId),
  }));
  const cards = file.cards.map((c) => ({
    ...c, id: to(c.id), deckId: to(c.deckId), front: remapText(c.front, map), back: remapText(c.back, map),
    mnemonic: remapText(c.mnemonic, map), distractors: c.distractors.map((x) => remapText(x, map)),
  }));
  const reviewItems = (file.reviewItems ?? []).map((i) => ({ ...i, id: to(i.id), cardId: to(i.cardId), deckId: to(i.deckId) }));
  const reviewLogs = (file.reviewLogs ?? []).map((l) => ({
    ...l, id: to(l.id), reviewItemId: to(l.reviewItemId), cardId: to(l.cardId), deckId: to(l.deckId),
  }));
  const media = file.media.map((m) => toMedia(m, to(m.id)));
  return {
    put: { folders, decks, cards, reviewItems, reviewLogs, media },
    summary: { added: folders.length + decks.length + cards.length, updated: 0, skipped: 0 },
  };
}

export function planImport(file: BackupFile, existing: ExistingMeta, mode: MergeMode, targetFolderId: Id | null): MergePlan {
  if (mode === 'copy') return planCopy(file, targetFolderId);

  const summary = { added: 0, updated: 0, skipped: 0 };
  const folderIds = new Set(file.folders.map((f) => f.id));
  const pick = <T extends { id: Id; updatedAt: number }>(
    records: T[],
    adjust: (r: T) => T = (r) => r,
    keepPlacement: (r: T, local: Id | null) => T = (r) => r,
  ): T[] => {
    const out: T[] = [];
    for (const r of records) {
      if (!existing.ids.has(r.id)) {
        out.push(adjust(r));
        summary.added++;
      } else if (r.updatedAt > (existing.updatedAt.get(r.id) ?? 0)) {
        const local = existing.placement?.get(r.id);
        out.push(local === undefined ? r : keepPlacement(r, local));
        summary.updated++;
      } else {
        summary.skipped++;
      }
    }
    return out;
  };
  const rootParent = (parentId: Id | null): Id | null => {
    if (parentId !== null && folderIds.has(parentId)) return parentId;
    if (targetFolderId !== null) return targetFolderId;
    return parentId !== null && existing.ids.has(parentId) ? parentId : null;
  };

  const folders = pick(
    file.folders,
    (f) => ({ ...f, parentId: rootParent(f.parentId) }),
    (f, parentId) => ({ ...f, parentId }),
  );
  const decks = pick(
    file.decks,
    (d) => ({ ...d, folderId: rootParent(d.folderId) }),
    (d, folderId) => ({ ...d, folderId }),
  );
  const cards = pick(file.cards);
  const fresh = <T extends { id: Id }>(records: T[] | undefined) => (records ?? []).filter((r) => !existing.ids.has(r.id));
  const media = file.media.filter((m) => !existing.ids.has(m.id)).map((m) => toMedia(m, m.id));
  return { put: { folders, decks, cards, reviewItems: fresh(file.reviewItems), reviewLogs: fresh(file.reviewLogs), media }, summary };
}
