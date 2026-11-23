import type { Card, Deck, Folder, Id, Media, ReviewItem, ReviewLog } from '../domain/types';

export class StorageFullError extends Error {
  constructor(message = 'Device storage is full') {
    super(message);
    this.name = 'StorageFullError';
  }
}

export interface Repository {
  listFolders(): Promise<Folder[]>;
  saveFolder(f: Folder): Promise<void>;
  deleteFolder(id: Id, opts: { cascade: true }): Promise<void>;
  restoreFolder(id: Id): Promise<void>;
  moveFolder(id: Id, parentId: Id | null): Promise<void>;

  listDecks(): Promise<Deck[]>;
  getDeck(id: Id): Promise<Deck | undefined>;
  saveDeck(d: Deck): Promise<void>;
  deleteDeck(id: Id): Promise<void>;
  restoreDeck(id: Id): Promise<void>;
  duplicateDeck(id: Id): Promise<Deck>;
  moveDeck(id: Id, folderId: Id | null): Promise<void>;

  listCards(deckId: Id): Promise<Card[]>;
  getCard(id: Id): Promise<Card | undefined>;
  saveCard(card: Card): Promise<void>;
  saveCards(cards: Card[]): Promise<void>;
  deleteCards(ids: Id[]): Promise<void>;
  restoreCards(ids: Id[]): Promise<void>;

  getDueItems(deckIds: Id[], until: number, limit: number): Promise<ReviewItem[]>;
  getNewItems(deckIds: Id[], limit: number): Promise<ReviewItem[]>;
  countDue(deckId: Id, until: number): Promise<{ due: number; new: number }>;
  saveReview(item: ReviewItem | null, log: ReviewLog): Promise<void>;
  listLogs(range?: { from: number; to: number }, deckIds?: Id[]): Promise<ReviewLog[]>;

  putMedia(m: Media): Promise<void>;
  getMedia(id: Id): Promise<Media | undefined>;

  getKV<T>(key: string): Promise<T | undefined>;
  setKV(key: string, value: unknown): Promise<void>;

  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
