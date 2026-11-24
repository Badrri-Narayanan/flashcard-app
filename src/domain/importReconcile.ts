import { SUSPENDED_DUE, newReviewItem } from './scheduler';
import type { Card, CardType, Id, ReviewItem } from './types';
import { variantsFor } from './variants';

export interface ImportReconcile {
  /** Items to write: chosen incoming items, changed or retired local items, and new items for missing variants. */
  put: ReviewItem[];
  /** Incoming item ids that were not used; logs pointing at them should not be imported either. */
  droppedIncoming: Id[];
}

const reviewedAt = (i: ReviewItem) => i.lastReview ?? -Infinity;

function latest(items: ReviewItem[]): ReviewItem | undefined {
  return items.reduce<ReviewItem | undefined>((best, i) => (!best || reviewedAt(i) > reviewedAt(best) ? i : best), undefined);
}

/**
 * Leaves an imported card with exactly one live item per variant it needs.
 * `local` are the card's live stored items; `prevType` is its stored type (null when the card is new here).
 * The local item wins unless the incoming one was reviewed later; a changed type retires every local item.
 */
export function reconcileImportedItems(
  card: Card,
  prevType: CardType | null,
  local: ReviewItem[],
  incoming: ReviewItem[],
  at: number,
): ImportReconcile {
  if (card.deletedAt !== null) return { put: incoming, droppedIncoming: [] };

  const usable = prevType === null || prevType === card.type ? local : [];
  const chosen: ReviewItem[] = [];
  for (const variant of variantsFor(card)) {
    const mine = latest(usable.filter((i) => i.variant === variant));
    const theirs = latest(incoming.filter((i) => i.variant === variant));
    const pick = theirs && (!mine || reviewedAt(theirs) > reviewedAt(mine)) ? theirs : mine;
    chosen.push(pick ?? newReviewItem(card.id, card.deckId, variant, card.suspended));
  }

  const chosenIds = new Set(chosen.map((i) => i.id));
  const localIds = new Set(local.map((i) => i.id));
  const put: ReviewItem[] = local.filter((i) => !chosenIds.has(i.id)).map((i) => ({ ...i, deletedAt: at }));
  for (const i of chosen) {
    let due = i.due;
    if (card.suspended) due = SUSPENDED_DUE;
    else if (i.due === SUSPENDED_DUE) due = at;
    const fixed = due !== i.due || i.deckId !== card.deckId ? { ...i, due, deckId: card.deckId } : i;
    if (fixed !== i || !localIds.has(i.id)) put.push(fixed);
  }
  return { put, droppedIncoming: incoming.filter((i) => !chosenIds.has(i.id)).map((i) => i.id) };
}
