import type { Rating } from '../../domain/types';

export const SWIPE_THRESHOLD_PX = 80;

export type SwipeDecision = Rating | 'flip' | null;

/** Right = Good, left = Again once revealed; before reveal any long-enough swipe just flips. */
export function swipeDecision(dx: number, revealed: boolean): SwipeDecision {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null;
  if (!revealed) return 'flip';
  return dx > 0 ? 3 : 1;
}
