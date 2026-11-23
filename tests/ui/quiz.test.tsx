import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

afterEach(cleanup);
beforeEach(async () => {
  await db.delete();
  await db.open();
});

function mkDeck(): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}
async function seed(n: number) {
  const deck = mkDeck();
  await repo.saveDeck(deck);
  for (let i = 1; i <= n; i++) await repo.saveCard(mkCard(deck.id, { front: `question ${i}`, back: `answer ${i}` }));
  return deck;
}
function renderAt(path: string, settings: Partial<AppSettings> = {}) {
  const value: [AppSettings, () => void] = [{ ...DEFAULT_SETTINGS, ...settings }, () => undefined];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SettingsContext.Provider value={value}>
      <RouterProvider router={router} />
    </SettingsContext.Provider>,
  );
  return router;
}
async function currentQuestion(): Promise<string> {
  return (await screen.findByText(/^question \d+$/)).textContent ?? '';
}
const answerOf = (question: string) => question.replace('question', 'answer');
async function optionButton(text: string) {
  const group = await screen.findByRole('group', { name: 'Answer options' });
  return within(group).getByText(text).closest('button')!;
}

describe('quiz mode', () => {
  it('is disabled with an explanation on the deck page under 4 cards', async () => {
    const deck = await seed(3);
    renderAt(`/deck/${deck.id}`);
    const button = await screen.findByRole('button', { name: 'Quiz' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Quiz needs at least 4 cards in a deck or folder.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Quiz needs at least 4 cards in a deck or folder.');
  });

  it('links to the quiz route from the deck page with 4+ cards', async () => {
    const deck = await seed(4);
    renderAt(`/deck/${deck.id}`);
    expect(await screen.findByRole('link', { name: 'Quiz' })).toHaveAttribute('href', `/study/deck/${deck.id}/quiz`);
  });

  it('shows the explanation instead of a quiz when the route is opened with too few cards', async () => {
    const deck = await seed(3);
    renderAt(`/study/deck/${deck.id}/quiz`);
    expect(await screen.findByText('Quiz needs at least 4 cards in a deck or folder.')).toBeInTheDocument();
    expect(await repo.listLogs()).toHaveLength(0);
  });

  it('answering writes a quiz log with correct, via keys 1-4 and Enter to advance', async () => {
    const user = userEvent.setup();
    const deck = await seed(5);
    const before = await db.reviewItems.toArray();
    renderAt(`/study/deck/${deck.id}/quiz`);
    const q1 = await currentQuestion();
    const correct = await optionButton(answerOf(q1));
    const options = within(screen.getByRole('group', { name: 'Answer options' })).getAllByRole('button');
    expect(options).toHaveLength(4);
    await user.keyboard(String(options.indexOf(correct) + 1));

    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    const [log] = await repo.listLogs();
    expect(log).toMatchObject({ mode: 'quiz', correct: true, rating: null, confidence: null, deckId: deck.id });
    expect(log.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.keyboard('2');
    await new Promise((r) => setTimeout(r, 30));
    expect(await repo.listLogs()).toHaveLength(1);

    await user.keyboard('{Enter}');
    await waitFor(async () => expect(await currentQuestion()).not.toBe(q1));
    expect(await db.reviewItems.toArray()).toEqual(before);
  });

  it('a wrong tap logs correct: false and the results list shows missed cards with a Learn link', async () => {
    const user = userEvent.setup();
    const deck = await seed(4);
    const router = renderAt(`/study/deck/${deck.id}/quiz`);
    const missed: string[] = [];
    for (let i = 0; i < 4; i++) {
      const q = await currentQuestion();
      const group = await screen.findByRole('group', { name: 'Answer options' });
      const wrong = within(group).getAllByRole('button').find((b) => b.textContent !== answerOf(q))!;
      if (i < 2) {
        await user.click(wrong);
        missed.push(q);
      } else {
        await user.click(await optionButton(answerOf(q)));
      }
      await user.click(screen.getByRole('button', { name: i === 3 ? 'See results' : 'Next question' }));
    }
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    const logs = await repo.listLogs();
    expect(logs).toHaveLength(4);
    expect(logs.every((l) => l.mode === 'quiz')).toBe(true);
    expect(logs.filter((l) => !l.correct)).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument();

    const list = screen.getByRole('heading', { name: 'Cards to review' }).closest('section')!;
    for (const q of missed) {
      expect(within(list).getByText(q)).toBeInTheDocument();
      expect(within(list).getByText(answerOf(q))).toBeInTheDocument();
    }
    await user.click(screen.getByRole('link', { name: 'Study these in Learn' }));
    expect(router.state.location.pathname).toBe(`/study/deck/${deck.id}/learn`);
  });

  it('quizzes at most 10 questions', async () => {
    const deck = await seed(12);
    renderAt(`/study/deck/${deck.id}/quiz`);
    await currentQuestion();
    expect(screen.getByText('Question 1 of 10')).toBeInTheDocument();
  });
});
