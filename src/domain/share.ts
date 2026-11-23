import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { SCHEMA_VERSION, type BackupFile, type BackupMedia } from './backup';
import type { Card, Deck, Id } from './types';

export const SHARE_URL_WARN = 8_000;
export const SHARE_URL_MAX = 2_000_000;
export const SHARE_QR_MAX = 2_900;
const DEFAULT_BUDGET = 1_500_000;
const MEDIA_REF = /media:([\w-]+)/g;

export interface SharePayload {
  v: 1;
  deck: Pick<Deck, 'id' | 'name' | 'description' | 'emoji' | 'color' | 'settings' | 'updatedAt'>;
  cards: Pick<Card, 'id' | 'type' | 'front' | 'back' | 'distractors' | 'mnemonic' | 'tags' | 'langFront' | 'langBack' | 'updatedAt'>[];
  media: BackupMedia[];
}

export type DecodeResult = { ok: true; payload: SharePayload } | { ok: false; reason: 'truncated' | 'invalid' };

export function encodeShare(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isPayload(v: unknown): v is SharePayload {
  if (!isObject(v) || v.v !== 1 || !isObject(v.deck) || !Array.isArray(v.cards) || !Array.isArray(v.media)) return false;
  const d = v.deck;
  if (typeof d.id !== 'string' || typeof d.name !== 'string' || !isObject(d.settings)) return false;
  const cardsOk = v.cards.every(
    (c) => isObject(c) && typeof c.id === 'string' && typeof c.front === 'string' && typeof c.back === 'string' &&
      typeof c.type === 'string' && Array.isArray(c.distractors) && Array.isArray(c.tags) && typeof c.mnemonic === 'string',
  );
  const mediaOk = v.media.every((m) => isObject(m) && typeof m.id === 'string' && typeof m.mime === 'string' && typeof m.dataBase64 === 'string');
  return cardsOk && mediaOk;
}

export function decodeShare(s: string): DecodeResult {
  let text: string | null;
  try {
    text = s ? decompressFromEncodedURIComponent(s) : null;
  } catch {
    text = null;
  }
  if (!text) return { ok: false, reason: 'invalid' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: text.startsWith('{') ? 'truncated' : 'invalid' };
  }
  return isPayload(raw) ? { ok: true, payload: raw } : { ok: false, reason: 'invalid' };
}

function referencedMedia(cards: Pick<Card, 'front' | 'back' | 'mnemonic' | 'distractors'>[]): Id[] {
  const ids = new Set<Id>();
  for (const c of cards) {
    for (const text of [c.front, c.back, c.mnemonic, ...c.distractors]) for (const m of text.matchAll(MEDIA_REF)) ids.add(m[1]);
  }
  return [...ids];
}

/** Encoded length per base64 character for media; base64 barely compresses, so this is a safe over-estimate. */
const MEDIA_ENCODE_FACTOR = 1.6;
const mediaCost = (m: BackupMedia) => Math.ceil((m.dataBase64.length + m.mime.length + 64) * MEDIA_ENCODE_FACTOR);

/**
 * Images are added in card order while the estimated encoded size stays within `budgetBytes`; the rest are dropped.
 * Compresses the text once to get a baseline, estimates media by length, and verifies with one final encode
 * (dropping trailing images only in the rare case the estimate was too low).
 */
export function buildSharePayload(
  deck: Deck,
  cards: Card[],
  mediaLookup: (id: Id) => BackupMedia | undefined,
  budgetBytes = DEFAULT_BUDGET,
): { payload: SharePayload; droppedImages: number } {
  const payload: SharePayload = {
    v: 1,
    deck: {
      id: deck.id, name: deck.name, description: deck.description, emoji: deck.emoji, color: deck.color,
      settings: deck.settings, updatedAt: deck.updatedAt,
    },
    cards: cards.map((c) => ({
      id: c.id, type: c.type, front: c.front, back: c.back, distractors: c.distractors, mnemonic: c.mnemonic,
      tags: c.tags, langFront: c.langFront, langBack: c.langBack, updatedAt: c.updatedAt,
    })),
    media: [],
  };
  let used = encodeShare(payload).length;
  let dropped = 0;
  for (const id of referencedMedia(payload.cards)) {
    const m = mediaLookup(id);
    if (!m) continue;
    const cost = mediaCost(m);
    if (used + cost <= budgetBytes) {
      payload.media.push(m);
      used += cost;
    } else dropped++;
  }
  while (payload.media.length > 0 && encodeShare(payload).length > budgetBytes) {
    payload.media.pop();
    dropped++;
  }
  return { payload, droppedImages: dropped };
}

/** The deck keeps the shared id and records it as `sourceId`; folder and review state are local concerns. */
export function payloadToBackup(p: SharePayload): BackupFile {
  const t = p.deck.updatedAt;
  return {
    app: 'flashcards',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    scope: 'deck',
    folders: [],
    decks: [{
      ...p.deck, createdAt: t, deletedAt: null, folderId: null, order: 0, sourceId: p.deck.id, matchBestMs: null,
    }],
    cards: p.cards.map((c) => ({ ...c, deckId: p.deck.id, createdAt: c.updatedAt, deletedAt: null, suspended: false, trouble: false })),
    media: p.media,
  };
}
