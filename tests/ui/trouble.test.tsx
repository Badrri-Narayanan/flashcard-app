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

function mkDeck(over: Partial<Deck> = {}): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS, confidencePrompt: false }, sourceId: null, matchBestMs: null, ...over,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

function renderAt(path: string) {
  const value: [AppSettings, () => void] = [{ ...DEFAULT_SETTINGS, flipAnimation: false }, () => undefined];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SettingsContext.Provider value={value}>
      <RouterProvider router={router} />
    </SettingsContext.Provider>,
  );
  return router;
}

async function seedTrouble() {
  const deck = mkDeck();
  await repo.saveDeck(deck);
  const card = mkCard(deck.id, { front: 'hard one', trouble: true });
  const fine = mkCard(deck.id, { front: 'easy one' });
  const gone = mkCard(deck.id, { front: 'deleted one', trouble: true });
  await repo.saveCards([card, fine, gone]);
  await repo.deleteCards([gone.id]);
  await repo.saveReviewItems((await repo.getReviewItemsForCard(card.id)).map((i) => ({ ...i, lapses: 7 })));
  return { deck, card };
}

describe('trouble page', () => {
  it('lists only live trouble cards, optionally filtered by deck', async () => {
    const { deck } = await seedTrouble();
    const other = mkDeck({ name: 'Other' });
    await repo.saveDeck(other);
    await repo.saveCard(mkCard(other.id, { front: 'other trouble', trouble: true }));

    renderAt(`/trouble?deck=${deck.id}`);
    expect(await screen.findByText('hard one')).toBeInTheDocument();
    expect(screen.queryByText('easy one')).toBeNull();
    expect(screen.queryByText('deleted one')).toBeNull();
    expect(screen.queryByText('other trouble')).toBeNull();
    cleanup();

    renderAt('/trouble');
    expect(await screen.findByText('other trouble')).toBeInTheDocument();
    expect(screen.getByText('hard one')).toBeInTheDocument();
  });

  it('mark as fixed clears the flag and resets lapses', async () => {
    const user = userEvent.setup();
    const { card } = await seedTrouble();
    renderAt('/trouble');
    await user.click(await screen.findByRole('button', { name: /Mark “hard one” as fixed/ }));
    await waitFor(async () => expect((await repo.getCard(card.id))!.trouble).toBe(false));
    const items = await repo.getReviewItemsForCard(card.id);
    expect(items.every((i) => i.lapses === 0)).toBe(true);
    expect(await repo.listLogs()).toHaveLength(0);
    expect(await screen.findByText(/No trouble cards/)).toBeInTheDocument();
  });

  it('suspend suspends the card and keeps it listed', async () => {
    const user = userEvent.setup();
    const { card } = await seedTrouble();
    renderAt('/trouble');
    await user.click(await screen.findByRole('button', { name: /Suspend “hard one”/ }));
    await waitFor(async () => expect((await repo.getCard(card.id))!.suspended).toBe(true));
    expect((await repo.getCard(card.id))!.trouble).toBe(true);
    expect(await screen.findByText('Suspended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suspend “hard one”/ })).toBeNull();
  });

  it('suggestion buttons open the editor focused on the relevant field', async () => {
    const user = userEvent.setup();
    const { deck, card } = await seedTrouble();
    const router = renderAt('/trouble');
    const group = await screen.findByRole('group', { name: /Suggested fixes for “hard one”/ });
    await user.click(within(group).getByRole('link', { name: 'Add a memory hook' }));
    expect(router.state.location.pathname).toBe(`/deck/${deck.id}/edit/${card.id}`);
    expect(router.state.location.search).toBe('?focus=mnemonic');
    await waitFor(() => expect(screen.getByLabelText('Memory hook')).toHaveFocus());
  });

  it('the editor honours ?focus=back and defaults to the front', async () => {
    const { deck, card } = await seedTrouble();
    renderAt(`/deck/${deck.id}/edit/${card.id}?focus=back`);
    await waitFor(() => expect(screen.getByLabelText('Back')).toHaveFocus());
    cleanup();
    renderAt(`/deck/${deck.id}/edit/${card.id}`);
    await waitFor(() => expect(screen.getByLabelText('Front')).toHaveFocus());
  });

  it('the deck page links to trouble cards only when there are some', async () => {
    const { deck } = await seedTrouble();
    renderAt(`/deck/${deck.id}`);
    expect(await screen.findByRole('link', { name: 'Trouble cards (1)' })).toHaveAttribute('href', `/trouble?deck=${deck.id}`);
  });
});

describe('learn mode trouble toast', () => {
  it('flags a card on its sixth lapse and offers Fix it', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id, { front: 'question 1', back: 'answer 1' });
    await repo.saveCard(card);
    await repo.saveReviewItems((await repo.getReviewItemsForCard(card.id)).map((i) => ({ ...i, lapses: 5, reps: 8, state: 2, stability: 5, difficulty: 5, lastReview: Date.now() - 864e5, due: Date.now() - 1000 })));

    const router = renderAt(`/study/deck/${deck.id}/learn`);
    await screen.findByText('question 1');
    await user.keyboard(' ');
    await screen.findByRole('group', { name: 'Rate your answer' });
    await user.keyboard('1');

    await waitFor(async () => expect((await repo.getCard(card.id))!.trouble).toBe(true));
    expect(await screen.findByText('This card keeps tripping you up — Fix it?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(router.state.location.pathname).toBe('/trouble');
    expect(router.state.location.search).toBe(`?deck=${deck.id}`);
  });
});
