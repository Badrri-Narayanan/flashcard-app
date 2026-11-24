export const SWIPE_THRESHOLD_PX = 80;

export type SwipeDecision = 'next' | 'prev' | null;

/** Like a deck of cards: swipe left brings the next card, swipe right goes back to the previous one. */
export function swipeDecision(dx: number): SwipeDecision {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null;
  return dx < 0 ? 'next' : 'prev';
}
