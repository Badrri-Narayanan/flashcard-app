import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(async () => {
  await db.delete();
  await db.open();
});

function mkDeck(over: Partial<Deck> = {}): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}
async function seed(n: number, deckOver: Partial<Deck> = {}) {
  const deck = mkDeck(deckOver);
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

describe('type mode', () => {
  it('Enter checks, Enter again advances, and a close answer counts as correct with a note and diff', async () => {
    const user = userEvent.setup();
    const deck = await seed(0);
    await repo.saveCard(mkCard(deck.id, { front: 'to receive', back: 'receive' }));
    renderAt(`/study/deck/${deck.id}/type`);
    await screen.findByText('to receive');
    const input = screen.getByRole('textbox', { name: 'Your answer' });
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveFocus();
    await user.type(input, 'recieve{Enter}');

    expect(await screen.findByText('Almost — check spelling')).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer compared with the expected answer')).toBeInTheDocument();
    const [log] = await repo.listLogs();
    expect(log).toMatchObject({ mode: 'type', correct: true, rating: null, deckId: deck.id });
    expect(screen.queryByRole('button', { name: 'I was right' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(await repo.listLogs()).toHaveLength(1);
  });

  it('a wrong answer logs false and "I was right" flips the same log to correct', async () => {
    const user = userEvent.setup();
    const deck = await seed(1);
    renderAt(`/study/deck/${deck.id}/type`);
    const q = await currentQuestion();
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), `nonsense{Enter}`);
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText(answerOf(q))).toBeInTheDocument();
    const [before] = await repo.listLogs();
    expect(before.correct).toBe(false);

    await user.click(screen.getByRole('button', { name: 'I was right' }));
    expect(await screen.findByText('Marked as correct.')).toBeInTheDocument();
    await waitFor(async () => expect((await repo.listLogs())[0].correct).toBe(true));
    const logs = await repo.listLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(before.id);
    expect(screen.queryByRole('button', { name: 'I was right' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('shortcut R also overrides, and an empty answer is wrong', async () => {
    const user = userEvent.setup();
    const deck = await seed(1);
    renderAt(`/study/deck/${deck.id}/type`);
    await currentQuestion();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    await user.keyboard('r');
    await waitFor(async () => expect((await repo.listLogs())[0].correct).toBe(true));
  });

  it('does not change FSRS scheduling', async () => {
    const user = userEvent.setup();
    const deck = await seed(1);
    const before = await db.reviewItems.toArray();
    renderAt(`/study/deck/${deck.id}/type`);
    await currentQuestion();
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'x{Enter}');
    await screen.findByText('Not quite.');
    expect(await db.reviewItems.toArray()).toEqual(before);
  });
});

describe('match game', () => {
  const tile = (text: string) => screen.getByRole('button', { name: text });

  it('is disabled with an explanation on the deck page under 3 cards, enabled otherwise', async () => {
    const small = await seed(2);
    renderAt(`/deck/${small.id}`);
    const button = await screen.findByRole('button', { name: 'Match' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Match needs at least 3 cards in a deck or folder.');
    cleanup();
    const big = await seed(3);
    renderAt(`/deck/${big.id}`);
    expect(await screen.findByRole('link', { name: 'Match' })).toHaveAttribute('href', `/study/deck/${big.id}/match`);
  });

  it('shows the explanation when the route is opened with too few cards', async () => {
    const deck = await seed(2);
    renderAt(`/study/deck/${deck.id}/match`);
    expect(await screen.findByText('Match needs at least 3 cards in a deck or folder.')).toBeInTheDocument();
    expect(await repo.listLogs()).toHaveLength(0);
  });

  async function startGame(user: ReturnType<typeof userEvent.setup>, deck: Deck) {
    renderAt(`/study/deck/${deck.id}/match`);
    await screen.findByRole('group', { name: 'Matching tiles' });
    return user;
  }

  it('clears tiles on a correct pair, penalises wrong pairs, logs per pair and records the best time', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const deck = await seed(3);
    await startGame(user, deck);
    expect(screen.getAllByRole('button').filter((b) => /^(question|answer) \d$/.test(b.textContent ?? ''))).toHaveLength(6);

    await user.click(tile('question 2'));
    await user.click(tile('answer 3'));
    expect(await screen.findByText('✗ Not a match. +1 second.')).toBeInTheDocument();

    await user.click(tile('question 1'));
    await user.click(tile('answer 1'));
    expect(screen.queryByText('question 1')).not.toBeInTheDocument();
    expect(screen.queryByText('answer 1')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 matched')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await user.click(tile('question 2'));
    await user.click(tile('answer 2'));
    await user.click(tile('question 3'));
    await user.click(tile('answer 3'));

    expect(await screen.findByText('All matched!')).toBeInTheDocument();
    expect(screen.getByText('1 wrong try (+1s each)')).toBeInTheDocument();
    expect(screen.getByText('★ New best time!')).toBeInTheDocument();

    const logs = await repo.listLogs();
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.mode === 'match' && l.deckId === deck.id)).toBe(true);
    const cards = await repo.listCards(deck.id);
    const byFront = (front: string) => cards.find((c) => c.front === front)!;
    const correctOf = (front: string) => logs.find((l) => l.cardId === byFront(front).id)!.correct;
    expect(correctOf('question 1')).toBe(true);
    expect(correctOf('question 2')).toBe(false);
    expect(correctOf('question 3')).toBe(false);

    const saved = await repo.getDeck(deck.id);
    expect(saved?.matchBestMs).toBeGreaterThanOrEqual(6000);
    expect(saved?.matchBestMs).toBeLessThan(6500);
  });

  it('only saves a best time when it improves', async () => {
    const user = userEvent.setup();
    const deck = await seed(3, { matchBestMs: 1 });
    await startGame(user, deck);
    for (const n of [1, 2, 3]) {
      await user.click(tile(`question ${n}`));
      await user.click(tile(`answer ${n}`));
    }
    expect(await screen.findByText('All matched!')).toBeInTheDocument();
    expect(screen.queryByText('★ New best time!')).not.toBeInTheDocument();
    expect(screen.getByText(/^Best:/)).toBeInTheDocument();
    expect((await repo.getDeck(deck.id))?.matchBestMs).toBe(1);
  });

  it('does not save a best time for a folder scope', async () => {
    const user = userEvent.setup();
    const folder: Folder = { ...baseRecord(), parentId: null, name: 'F', description: '', color: '#6366f1', emoji: '📁', order: 0 };
    await repo.saveFolder(folder);
    const deck = await seed(3);
    await repo.saveDeck({ ...deck, folderId: folder.id });
    renderAt(`/study/folder/${folder.id}/match`);
    await screen.findByRole('group', { name: 'Matching tiles' });
    for (const n of [1, 2, 3]) {
      await user.click(tile(`question ${n}`));
      await user.click(tile(`answer ${n}`));
    }
    expect(await screen.findByText('All matched!')).toBeInTheDocument();
    expect((await repo.getDeck(deck.id))?.matchBestMs).toBeNull();
  });

  it('tiles work from the keyboard', async () => {
    const user = userEvent.setup();
    const deck = await seed(3);
    await startGame(user, deck);
    tile('question 1').focus();
    await user.keyboard('{Enter}');
    expect(tile('question 1')).toHaveAttribute('aria-pressed', 'true');
    tile('answer 1').focus();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.queryByText('answer 1')).not.toBeInTheDocument());
  });
});

describe('study home mode picker', () => {
  it('offers every mode for each deck and folder', async () => {
    const folder: Folder = { ...baseRecord(), parentId: null, name: 'Languages', description: '', color: '#6366f1', emoji: '📁', order: 0 };
    await repo.saveFolder(folder);
    const deck = await seed(3);
    await repo.saveDeck({ ...deck, folderId: folder.id });
    renderAt('/study');
    for (const name of ['Spanish', 'Languages']) {
      const nav = await screen.findByRole('navigation', { name: `Study modes for ${name}` });
      const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      const scope = name === 'Spanish' ? `deck/${deck.id}` : `folder/${folder.id}`;
      expect(hrefs).toEqual(['learn', 'cram', 'quiz', 'type', 'match'].map((m) => `/study/${scope}/${m}`));
    }
  });
});
