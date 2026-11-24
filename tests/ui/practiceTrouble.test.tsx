import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, ReviewItem, ReviewLog, StudyMode } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

afterEach(cleanup);
beforeEach(async () => {
  await db.delete();
  await db.open();
});

const TOAST = 'This card keeps tripping you up — Fix it?';

/** Each card already has seven wrong answers in `mode`; one more wrong answer crosses the low-accuracy line. */
async function seed(n: number, mode: StudyMode) {
  const deck: Deck = {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '', emoji: '', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
  };
  await repo.saveDeck(deck);
  const cards: Card[] = Array.from({ length: n }, (_, i) => ({
    ...baseRecord(), deckId: deck.id, type: 'basic', front: `question ${i + 1}`, back: `answer ${i + 1}`, distractors: [],
    mnemonic: '', tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
  }));
  await repo.saveCards(cards);
  const at = Date.now() + 1;
  for (const card of cards) {
    const [item] = await repo.getReviewItemsForCard(card.id);
    for (let k = 0; k < 7; k++) await repo.saveReview(null, wrongLog(item, mode, at + k));
  }
  return { deck, items: await repo.listReviewItems([deck.id]) };
}

function wrongLog(item: ReviewItem, mode: StudyMode, at: number): ReviewLog {
  return {
    ...baseRecord(), reviewItemId: item.id, cardId: item.cardId, deckId: item.deckId, mode, rating: null, correct: false,
    confidence: null, durationMs: 1, at, dayKey: '2026-01-01',
  };
}

function renderAt(path: string) {
  render(
    <SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </SettingsContext.Provider>,
  );
}

async function troubleFronts(): Promise<string[]> {
  return (await repo.listAllCards()).filter((c) => c.trouble).map((c) => c.front);
}

describe('trouble detection outside Learn', () => {
  it('a wrong quiz answer flags a card with low accuracy, offers Fix it, and leaves scheduling alone', async () => {
    const user = userEvent.setup();
    const { deck, items } = await seed(4, 'quiz');
    renderAt(`/study/deck/${deck.id}/quiz`);
    const question = (await screen.findByText(/^question \d$/)).textContent!;
    const group = await screen.findByRole('group', { name: 'Answer options' });
    const wrong = within(group).getAllByRole('button').find((b) => !b.textContent?.includes(question.replace('question', 'answer')))!;
    await user.click(wrong);
    await waitFor(async () => expect(await troubleFronts()).toEqual([question]));
    expect(await screen.findByText(TOAST)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix it' })).toBeInTheDocument();
    expect(await repo.listReviewItems([deck.id])).toEqual(items);
  });

  it('a wrong typed answer flags the card', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3, 'type');
    renderAt(`/study/deck/${deck.id}/type`);
    const question = (await screen.findByText(/^question \d$/)).textContent!;
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'nonsense{Enter}');
    await waitFor(async () => expect(await troubleFronts()).toEqual([question]));
    expect(await screen.findByText(TOAST)).toBeInTheDocument();
  });

  it('a pair matched after a wrong try flags the card', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3, 'match');
    renderAt(`/study/deck/${deck.id}/match`);
    await screen.findByRole('group', { name: 'Matching tiles' });
    await user.click(screen.getByRole('button', { name: 'question 2' }));
    await user.click(screen.getByRole('button', { name: 'answer 3' }));
    await user.click(screen.getByRole('button', { name: 'question 2' }));
    await user.click(screen.getByRole('button', { name: 'answer 2' }));
    await waitFor(async () => expect(await troubleFronts()).toEqual(['question 2']));
    expect(await screen.findByText(TOAST)).toBeInTheDocument();
  });
});
