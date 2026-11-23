import Dexie, { type Table } from 'dexie';
import type { Card, Deck, Folder, Media, ReviewItem, ReviewLog } from '../domain/types';

export interface KVEntry {
  key: string;
  value: unknown;
}

export class FlashcardDB extends Dexie {
  folders!: Table<Folder, string>;
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  reviewItems!: Table<ReviewItem, string>;
  reviewLogs!: Table<ReviewLog, string>;
  media!: Table<Media, string>;
  kv!: Table<KVEntry, string>;

  constructor(name = 'flashcard') {
    super(name);
    this.version(1).stores({
      folders: 'id, parentId, deletedAt',
      decks: 'id, folderId, sourceId, deletedAt',
      cards: 'id, deckId, *tags, trouble, deletedAt, updatedAt',
      reviewItems: 'id, cardId, deckId, [deckId+due], state, deletedAt',
      reviewLogs: 'id, reviewItemId, cardId, deckId, dayKey, at',
      media: 'id',
      kv: 'key',
    });
  }
}

export const db = new FlashcardDB();
