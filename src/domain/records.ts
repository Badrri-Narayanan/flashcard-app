import type { BackupMedia } from './backup';
import type {
  BaseRecord,
  Card,
  CardType,
  Confidence,
  Deck,
  DeckSettings,
  Folder,
  Rating,
  ReviewItem,
  ReviewLog,
  StudyMode,
  Variant,
} from './types';

/**
 * Shape checks for records that arrive from outside (backup files, share links). Each parser returns a clean copy
 * holding only the known fields, or null when any field has the wrong type or is out of range.
 */

type Raw = Record<string, unknown>;

export const MAX_DECK_LIMIT = 9999;
const CARD_TYPES: readonly CardType[] = ['basic', 'reversible', 'cloze', 'mcq'];
const MODES: readonly StudyMode[] = ['learn', 'quiz', 'type', 'match', 'cram'];
const CONFIDENCES: readonly Confidence[] = ['unsure', 'think', 'sure'];
const VARIANT = /^(fwd|rev|c\d+)$/;

export const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isNullableString = (v: unknown): v is string | null => v === null || isString(v);
const isNullableNum = (v: unknown): v is number | null => v === null || isNum(v);
const isLimit = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= MAX_DECK_LIMIT;

function base(r: Raw): BaseRecord | null {
  if (!isString(r.id) || r.id === '' || !isNum(r.createdAt) || !isNum(r.updatedAt) || !isNullableNum(r.deletedAt)) return null;
  return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt };
}

export function parseDeckSettings(v: unknown): DeckSettings | null {
  if (!isObject(v)) return null;
  const { newPerDay, reviewsPerDay, confidencePrompt, langFront, langBack } = v;
  if (!isLimit(newPerDay) || !isLimit(reviewsPerDay) || typeof confidencePrompt !== 'boolean') return null;
  if (!isString(langFront) || !isString(langBack)) return null;
  return { newPerDay, reviewsPerDay, confidencePrompt, langFront, langBack };
}

export function parseFolder(v: unknown): Folder | null {
  if (!isObject(v)) return null;
  const b = base(v);
  const { parentId, name, description, color, emoji, order } = v;
  if (!b || !isNullableString(parentId) || !isString(name) || !isString(description) || !isString(color) || !isString(emoji) || !isNum(order)) {
    return null;
  }
  return { ...b, parentId, name, description, color, emoji, order };
}

export function parseDeck(v: unknown): Deck | null {
  if (!isObject(v)) return null;
  const b = base(v);
  const settings = parseDeckSettings(v.settings);
  const { folderId, name, description, color, emoji, order, sourceId, matchBestMs } = v;
  if (!b || !settings || !isNullableString(folderId) || !isString(name) || !isString(description) || !isString(color)) return null;
  if (!isString(emoji) || !isNum(order) || !isNullableString(sourceId) || !isNullableNum(matchBestMs)) return null;
  return { ...b, folderId, name, description, color, emoji, order, settings, sourceId, matchBestMs };
}

/** The content fields a card carries in both backups and share links. */
export type CardContent = Pick<Card, 'type' | 'front' | 'back' | 'distractors' | 'mnemonic' | 'tags' | 'langFront' | 'langBack'>;

export function parseCardContent(v: Raw): CardContent | null {
  const { type, front, back, distractors, mnemonic, tags, langFront, langBack } = v;
  if (!CARD_TYPES.includes(type as CardType) || !isString(front) || !isString(back) || !isStrings(distractors)) return null;
  if (!isString(mnemonic) || !isStrings(tags) || !isNullableString(langFront) || !isNullableString(langBack)) return null;
  return { type: type as CardType, front, back, distractors: [...distractors], mnemonic, tags: [...tags], langFront, langBack };
}

export function parseCard(v: unknown): Card | null {
  if (!isObject(v)) return null;
  const b = base(v);
  const content = parseCardContent(v);
  const { deckId, suspended, trouble } = v;
  if (!b || !content || !isString(deckId) || typeof suspended !== 'boolean' || typeof trouble !== 'boolean') return null;
  return { ...b, deckId, ...content, suspended, trouble };
}

export function parseReviewItem(v: unknown): ReviewItem | null {
  if (!isObject(v)) return null;
  const b = base(v);
  const { cardId, deckId, variant, due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, learningSteps, state, lastReview } = v;
  if (!b || !isString(cardId) || !isString(deckId) || !isString(variant) || !VARIANT.test(variant)) return null;
  if (![due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses].every(isNum)) return null;
  if (learningSteps !== undefined && !isNum(learningSteps)) return null;
  if (!(state === 0 || state === 1 || state === 2 || state === 3) || !isNullableNum(lastReview)) return null;
  return {
    ...b, cardId, deckId, variant: variant as Variant, due: due as number, stability: stability as number,
    difficulty: difficulty as number, elapsedDays: elapsedDays as number, scheduledDays: scheduledDays as number,
    reps: reps as number, lapses: lapses as number, ...(learningSteps === undefined ? {} : { learningSteps }), state, lastReview,
  };
}

export function parseReviewLog(v: unknown): ReviewLog | null {
  if (!isObject(v)) return null;
  const b = base(v);
  const { reviewItemId, cardId, deckId, mode, rating, correct, confidence, durationMs, at, dayKey } = v;
  if (!b || !isString(reviewItemId) || !isString(cardId) || !isString(deckId) || !MODES.includes(mode as StudyMode)) return null;
  if (!(rating === null || rating === 1 || rating === 2 || rating === 3 || rating === 4) || typeof correct !== 'boolean') return null;
  if (!(confidence === null || CONFIDENCES.includes(confidence as Confidence))) return null;
  if (!isNum(durationMs) || !isNum(at) || !isString(dayKey)) return null;
  return {
    ...b, reviewItemId, cardId, deckId, mode: mode as StudyMode, rating: rating as Rating | null, correct,
    confidence: confidence as Confidence | null, durationMs, at, dayKey,
  };
}

export function parseBackupMedia(v: unknown): BackupMedia | null {
  if (!isObject(v)) return null;
  const { id, mime, width, height, dataBase64 } = v;
  if (!isString(id) || id === '' || !isString(mime) || !mime.startsWith('image/') || !isNum(width) || !isNum(height)) return null;
  if (!isString(dataBase64) || !/^[A-Za-z0-9+/=\s]*$/.test(dataBase64)) return null;
  return { id, mime, width, height, dataBase64 };
}

/** Keeps the records that parse; `invalid` counts the rest. */
export function parseAll<T>(list: unknown[], parse: (v: unknown) => T | null): { ok: T[]; invalid: number } {
  const ok: T[] = [];
  let invalid = 0;
  for (const v of list) {
    const r = parse(v);
    if (r) ok.push(r);
    else invalid++;
  }
  return { ok, invalid };
}
