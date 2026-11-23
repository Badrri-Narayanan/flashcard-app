import { repo } from '../../data/repo';
import { endOfStudyDay, startOfStudyDay } from '../../domain/day';
import { buildLearnQueue, computeBudgets } from '../../domain/queue';
import type { Id, ReviewItem } from '../../domain/types';

const NO_UPCOMING_UNTIL = Number.MAX_SAFE_INTEGER - 1;

export interface LoadedQueue {
  queue: ReviewItem[];
  /** Earliest scheduled review among these decks (clamped to now); null when nothing is scheduled. */
  nextDueAt: number | null;
  /** True when the queue is empty only because today's per-deck limits are used up. */
  limitReached: boolean;
}

/** Builds today's Learn queue for the decks, respecting per-deck daily budgets (+extraNew for "Study more"). */
export async function loadLearnQueue(
  deckIds: Id[],
  now: number,
  dayStartHour: number,
  extraNew = 0,
): Promise<LoadedQueue> {
  const decks = (await Promise.all(deckIds.map((id) => repo.getDeck(id)))).filter(
    (d): d is NonNullable<typeof d> => !!d && d.deletedAt === null,
  );
  const liveIds = decks.map((d) => d.id);
  const logs = (await repo.listLogs({ from: startOfStudyDay(now, dayStartHour), to: now }, liveIds)).filter(
    (l) => l.mode === 'learn',
  );
  const firstEver = await repo.getFirstLearnLogTimes([...new Set(logs.map((l) => l.reviewItemId))]);
  const budgets = computeBudgets(decks, logs, firstEver).map((b) => ({ ...b, newLeft: b.newLeft + extraNew }));

  const until = endOfStudyDay(now, dayStartHour);
  const dueLists = await Promise.all(budgets.map((b) => repo.getDueItems([b.deckId], until, b.reviewsLeft)));
  const freshLists = await Promise.all(
    budgets.map((b) => (b.newLeft > 0 ? repo.getNewItems([b.deckId], b.newLeft) : Promise.resolve([]))),
  );
  const fresh = freshLists.flat();
  const queue = buildLearnQueue({ due: dueLists.flat(), fresh, budgets, seed: Date.now() });

  let nextDueAt: number | null = null;
  if (queue.length === 0 && liveIds.length > 0) {
    const upcoming = await repo.getDueItems(liveIds, NO_UPCOMING_UNTIL, 1);
    if (upcoming.length > 0) nextDueAt = Math.max(now, upcoming[0].due);
  }
  let limitReached = false;
  if (queue.length === 0) {
    const checks = await Promise.all(
      budgets.map(async (b) => {
        if (b.newLeft === 0 && (await repo.getNewItems([b.deckId], 1)).length > 0) return true;
        return b.reviewsLeft === 0 && (await repo.getDueItems([b.deckId], until, 1)).length > 0;
      }),
    );
    limitReached = checks.some(Boolean);
  }
  return { queue, nextDueAt, limitReached };
}

/** True when unseen cards remain (i.e. beyond whatever today's budget let into the session). */
export async function hasUnseenNew(deckIds: Id[]): Promise<boolean> {
  return (await repo.getNewItems(deckIds, 1)).length > 0;
}
