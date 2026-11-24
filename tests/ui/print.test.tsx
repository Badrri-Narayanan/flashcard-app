import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import { routes } from '../../src/ui/routes';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await db.delete();
  await db.open();
});

const mkDeck = (over: Partial<Deck> = {}): Deck => ({
  ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
});
const mkCard = (deckId: string, over: Partial<Card> = {}): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: 'hola', back: 'hello', distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
});

async function seed(n: number, over: (i: number) => Partial<Card> = () => ({})) {
  const deck = mkDeck();
  await repo.saveDeck(deck);
  const cards = Array.from({ length: n }, (_, i) => mkCard(deck.id, { createdAt: 1000 + i, front: `Q${i + 1}`, back: `A${i + 1}`, ...over(i) }));
  await repo.saveCards(cards);
  return { deck, cards };
}
function open(path: string) {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
const texts = (els: HTMLElement[]) => els.map((e) => e.textContent?.trim());

describe('print page', () => {
  it('cards layout mirrors back row order', async () => {
    const { deck } = await seed(4);
    open(`/print/${deck.id}/cards`);
    const fronts = await screen.findAllByTestId('print-front');
    expect(fronts.length).toBe(4);
    const order = (side: string) => texts(screen.getAllByTestId(side)).map((t) => t?.replace(/[QA]/, ''));
    const front = order('print-front');
    const back = order('print-back');
    expect(front).toEqual(['1', '2', '3', '4']);
    expect(back).toEqual(['2', '1', '4', '3']);
  });

  it('defaults to the cards layout for an unknown layout', async () => {
    const { deck } = await seed(2);
    open(`/print/${deck.id}`);
    expect((await screen.findAllByTestId('print-front')).length).toBe(2);
  });

  it('quiz layout answer key matches correctIndex', async () => {
    const { deck } = await seed(5);
    open(`/print/${deck.id}/quiz`);
    const questions = await screen.findAllByTestId('quiz-question');
    const key = screen.getByTestId('answer-key');
    for (const [i, q] of questions.entries()) {
      const options = within(q).getAllByRole('listitem');
      const correctText = `A${(q.textContent ?? '').match(/Q(\d+)/)![1]}`;
      const correctIdx = options.findIndex((o) => o.textContent?.includes(correctText));
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      const letter = String.fromCharCode(65 + correctIdx);
      expect(within(key).getByTestId(`key-${i + 1}`).textContent).toContain(letter);
    }
  });

  it('answer key hidden when toggle off', async () => {
    const { deck } = await seed(5);
    open(`/print/${deck.id}/worksheet`);
    expect(await screen.findByTestId('answer-key')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: /answer key/i }));
    expect(screen.queryByTestId('answer-key')).toBeNull();
  });

  it('hides the cloze blank on the front and reveals it on the back', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCard(mkCard(deck.id, { type: 'cloze', front: 'The capital of France is {{Paris}}.', back: '' }));
    open(`/print/${deck.id}/cards`);
    const front = await screen.findByTestId('print-front');
    expect(front.textContent).not.toContain('Paris');
    expect(screen.getByTestId('print-back').textContent).toContain('Paris');
  });

  it('excludes suspended cards', async () => {
    const { deck } = await seed(3, (i) => (i === 1 ? { suspended: true } : {}));
    open(`/print/${deck.id}/cards`);
    await waitFor(() => expect(screen.getAllByTestId('print-front').length).toBe(2));
    expect(screen.queryByText('Q2')).toBeNull();
  });

  it('notes skipped quiz cards on screen', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCard(mkCard(deck.id, { front: 'solo', back: 'only' }));
    open(`/print/${deck.id}/quiz`);
    expect(await screen.findByText(/1 card.*skipped/i)).toBeTruthy();
    expect(screen.queryAllByTestId('quiz-question').length).toBe(0);
  });
});
