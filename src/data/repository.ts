import type { Card, Deck, Folder, Id, Media, ReviewItem, ReviewLog } from '../domain/types';
import type { ExistingMeta } from '../domain/backup';

export class StorageFullError extends Error {
  readonly cause?: unknown;

  constructor(message = 'Device storage is full', options?: { cause?: unknown }) {
    super(message);
    this.cause = options?.cause;
    this.name = 'StorageFullError';
  }
}

export interface ImportRecords {
  folders: Folder[];
  decks: Deck[];
  cards: Card[];
  reviewItems: ReviewItem[];
  reviewLogs: ReviewLog[];
  media: Media[];
}

export interface Repository {
  listFolders(): Promise<Folder[]>;
  saveFolder(f: Folder): Promise<void>;
  deleteFolder(id: Id, opts: { cascade: true }): Promise<void>;
  restoreFolder(id: Id): Promise<void>;
  moveFolder(id: Id, parentId: Id | null): Promise<void>;

  listDecks(): Promise<Deck[]>;
  /** Returns soft-deleted rows too, so Undo can find them. */
  getDeck(id: Id): Promise<Deck | undefined>;
  saveDeck(d: Deck): Promise<void>;
  deleteDeck(id: Id): Promise<void>;
  restoreDeck(id: Id): Promise<void>;
  duplicateDeck(id: Id): Promise<Deck>;
  moveDeck(id: Id, folderId: Id | null): Promise<void>;

  listCards(deckId: Id): Promise<Card[]>;
  /** All non-deleted cards across decks; for building the global search index. */
  listAllCards(): Promise<Card[]>;
  /** Returns soft-deleted rows too, so Undo can find them. */
  getCard(id: Id): Promise<Card | undefined>;
  saveCard(card: Card): Promise<void>;
  saveCards(cards: Card[]): Promise<void>;
  deleteCards(ids: Id[]): Promise<void>;
  restoreCards(ids: Id[]): Promise<void>;

  /** Live review items for one card (all variants). */
  getReviewItemsForCard(cardId: Id): Promise<ReviewItem[]>;
  getDueItems(deckIds: Id[], until: number, limit: number): Promise<ReviewItem[]>;
  getNewItems(deckIds: Id[], limit: number): Promise<ReviewItem[]>;
  countDue(deckId: Id, until: number): Promise<{ due: number; new: number }>;
  saveReview(item: ReviewItem | null, log: ReviewLog): Promise<void>;
  /** Writes review items as given, with no log; for maintenance such as clearing lapses. */
  saveReviewItems(items: ReviewItem[]): Promise<void>;
  listLogs(range?: { from: number; to: number }, deckIds?: Id[]): Promise<ReviewLog[]>;
  /** Newest `limit` live logs for one card, newest first, via the cardId index. */
  listLogsForCard(cardId: Id, limit: number): Promise<ReviewLog[]>;
  /** Earliest `at` among live learn-mode logs per review item; items with no learn log are absent. */
  getFirstLearnLogTimes(reviewItemIds: Id[]): Promise<Map<Id, number>>;
  /** Soft-deletes one log (used by undo). */
  deleteLog(id: Id): Promise<void>;

  putMedia(m: Media): Promise<void>;
  getMedia(id: Id): Promise<Media | undefined>;

  /** Live review items (all variants) for the given decks. */
  listReviewItems(deckIds: Id[]): Promise<ReviewItem[]>;
  /** Live media records for the given ids; unknown or soft-deleted ids are skipped. */
  listMedia(ids: Id[]): Promise<Media[]>;
  /** Ids and updatedAt of every record in every synced table, soft-deleted included, so imports never collide. */
  getExistingMeta(): Promise<ExistingMeta>;
  /** Raw bulkPut of imported records, bypassing variant reconciliation and timestamp touching. */
  importRecords(put: Partial<ImportRecords>): Promise<void>;

  getKV<T>(key: string): Promise<T | undefined>;
  setKV(key: string, value: unknown): Promise<void>;

  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
