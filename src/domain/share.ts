import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { SCHEMA_VERSION, type BackupFile, type BackupMedia } from './backup';
import { isObject, parseAll, parseBackupMedia, parseCardContent, parseDeckSettings } from './records';
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

/** `skipped` counts damaged cards and images left out of the payload. */
export type DecodeResult = { ok: true; payload: SharePayload; skipped: number } | { ok: false; reason: 'truncated' | 'invalid' };

export function encodeShare(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

type ShareCard = SharePayload['cards'][number];

function parseShareCard(v: unknown): ShareCard | null {
  if (!isObject(v) || typeof v.id !== 'string' || v.id === '' || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return null;
  const content = parseCardContent(v);
  return content && { id: v.id, ...content, updatedAt: v.updatedAt };
}

/** A clean payload with damaged cards and images dropped, or null when the envelope or deck is unusable. */
function parsePayload(v: unknown): { payload: SharePayload; skipped: number } | null {
  if (!isObject(v) || v.v !== 1 || !isObject(v.deck) || !Array.isArray(v.cards) || !Array.isArray(v.media)) return null;
  const d = v.deck;
  const settings = parseDeckSettings(d.settings);
  const strings = [d.id, d.name, d.description, d.emoji, d.color];
  if (!settings || !strings.every((s) => typeof s === 'string') || d.id === '') return null;
  if (typeof d.updatedAt !== 'number' || !Number.isFinite(d.updatedAt)) return null;
  const cards = parseAll(v.cards, parseShareCard);
  const media = parseAll(v.media, parseBackupMedia);
  const deck = {
    id: d.id as string, name: d.name as string, description: d.description as string, emoji: d.emoji as string,
    color: d.color as string, settings, updatedAt: d.updatedAt,
  };
  return { payload: { v: 1, deck, cards: cards.ok, media: media.ok }, skipped: cards.invalid + media.invalid };
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
  const parsed = parsePayload(raw);
  return parsed ? { ok: true, ...parsed } : { ok: false, reason: 'invalid' };
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
