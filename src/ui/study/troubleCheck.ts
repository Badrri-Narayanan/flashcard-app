import { repo } from '../../data/repo';
import { onAfterPracticeAnswer } from '../../domain/leech';
import type { Card, Id, ReviewLog } from '../../domain/types';
import { strings } from '../strings';

const RECENT_LOG_LIMIT = 20;

export interface StudyToast {
  id: number;
  message: string;
  /** When present the toast offers this action, which navigates to `to`. */
  action?: { label: string; to: string };
}

/** The newest logs that the trouble rules look at for one card. */
export const recentCardLogs = (card: Card): Promise<ReviewLog[]> => repo.listLogsForCard(card.id, RECENT_LOG_LIMIT);

/** The "Fix it?" toast content for a card that was just flagged. */
export const troubleToast = (deckId: Id): Omit<StudyToast, 'id'> => ({
  message: strings.study.troubleToast,
  action: { label: strings.study.fixIt, to: `/trouble?deck=${deckId}` },
});

/**
 * Runs the accuracy rule after a Quiz, Type or Match log was saved. Reads the live card, so edits made since the
 * session loaded are respected. Returns the card's deck id when it was newly flagged, else null; never throws.
 */
export async function checkPracticeTrouble(cardId: Id): Promise<Id | null> {
  try {
    const card = await repo.getCard(cardId);
    if (!card || card.deletedAt !== null || card.trouble) return null;
    const flagged = await onAfterPracticeAnswer(card, await recentCardLogs(card), { saveCard: (c) => repo.saveCard(c) });
    return flagged ? card.deckId : null;
  } catch (err) {
    console.error('Trouble check failed', err);
    return null;
  }
}
