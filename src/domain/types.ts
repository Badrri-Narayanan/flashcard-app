export type Id = string;

export interface BaseRecord {
  id: Id;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Folder extends BaseRecord {
  parentId: Id | null;
  name: string;
  description: string;
  color: string;
  emoji: string;
  order: number;
}

export interface DeckSettings {
  newPerDay: number;
  reviewsPerDay: number;
  confidencePrompt: boolean;
  langFront: string;
  langBack: string;
}

export interface Deck extends BaseRecord {
  folderId: Id | null;
  name: string;
  description: string;
  color: string;
  emoji: string;
  order: number;
  settings: DeckSettings;
  sourceId: Id | null;
  matchBestMs: number | null;
}

export type CardType = 'basic' | 'reversible' | 'cloze' | 'mcq';

export interface Card extends BaseRecord {
  deckId: Id;
  type: CardType;
  front: string;
  back: string;
  distractors: string[];
  mnemonic: string;
  tags: string[];
  langFront: string | null;
  langBack: string | null;
  suspended: boolean;
  trouble: boolean;
}

export type Variant = 'fwd' | 'rev' | `c${number}`;

export interface ReviewItem extends BaseRecord {
  cardId: Id;
  deckId: Id;
  variant: Variant;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview: number | null;
}

export type StudyMode = 'learn' | 'quiz' | 'type' | 'match' | 'cram';

/** Again, Hard, Good, Easy. */
export type Rating = 1 | 2 | 3 | 4;

export type Confidence = 'unsure' | 'think' | 'sure';

export interface ReviewLog extends BaseRecord {
  reviewItemId: Id;
  cardId: Id;
  deckId: Id;
  mode: StudyMode;
  rating: Rating | null;
  correct: boolean;
  confidence: Confidence | null;
  durationMs: number;
  at: number;
  dayKey: string;
}

export interface Media extends BaseRecord {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

export const DEFAULT_DECK_SETTINGS: DeckSettings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  confidencePrompt: true,
  langFront: 'en-US',
  langBack: 'en-US',
};
