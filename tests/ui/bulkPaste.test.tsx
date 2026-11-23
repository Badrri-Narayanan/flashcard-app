import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Deck } from '../../src/domain/types';
import { routes } from '../../src/ui/routes';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

async function setup(path: string, decks: Deck[] = []) {
  for (const d of decks) await repo.saveDeck(d);
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

// fireEvent.change avoids user-event's special handling of "{" and tab characters.
async function paste(text: string) {
  fireEvent.change(await screen.findByLabelText('Your list'), { target: { value: text } });
}

describe('bulk paste dialog', () => {
  it('previews pasted rows and creates cards in the preselected deck', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await setup(`/import?mode=paste&deck=${deck.id}`, [mkDeck({ name: 'Other' }), deck]);

    expect(await screen.findByLabelText('Add to deck')).toHaveValue(deck.id);
    await waitFor(() => expect(screen.getByLabelText('Your list')).toHaveFocus());
    await paste('hola - hello\nadiós - goodbye\nbroken line');

    expect(await screen.findByText('hola')).toBeInTheDocument();
    expect(screen.getByText('goodbye')).toBeInTheDocument();
    expect(screen.getByText('Line 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create 2 cards' }));

    expect(await screen.findByText('Created 2 cards')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View deck' })).toHaveAttribute('href', `/deck/${deck.id}`);
    const cards = await repo.listCards(deck.id);
    expect(cards.map((c) => [c.front, c.back, c.type]).sort()).toEqual([
      ['adiós', 'goodbye', 'basic'],
      ['hola', 'hello', 'basic'],
    ]);
  });

  it('auto-detects the separator until the user changes it manually', async () => {
    await setup('/import?mode=paste', [mkDeck()]);
    await paste('a: b\nc: d');
    await waitFor(() => expect(screen.getByLabelText('Between front and back')).toHaveValue(':'));
    expect(screen.getByRole('button', { name: 'Create 2 cards' })).toBeEnabled();
  });

  it('disables create when nothing parses', async () => {
    await setup('/import?mode=paste', [mkDeck()]);
    await paste('no separator here');
    expect(await screen.findByText('1 line skipped (no back found)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 0 cards' })).toBeDisabled();
  });

  it('creates a new deck when "New deck…" is chosen', async () => {
    const user = userEvent.setup();
    await setup('/import?mode=paste', [mkDeck()]);
    await user.selectOptions(await screen.findByLabelText('Add to deck'), 'New deck…');
    await paste('one - uno');
    await user.click(await screen.findByRole('button', { name: 'Create 1 card' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a deck name.');

    await user.type(screen.getByLabelText('New deck name'), 'Numbers');
    await user.click(screen.getByRole('button', { name: 'Create 1 card' }));
    expect(await screen.findByText('Created 1 card')).toBeInTheDocument();

    const created = (await repo.listDecks()).find((d) => d.name === 'Numbers');
    expect(created).toBeDefined();
    expect(await repo.listCards(created!.id)).toHaveLength(1);
  });

  it('two-way cards get forward and reverse review items, and swap flips sides', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await setup(`/import?mode=paste&deck=${deck.id}`, [deck]);
    await user.click(await screen.findByRole('radio', { name: 'Two-way' }));
    await user.click(screen.getByRole('checkbox', { name: 'Swap sides' }));
    await paste('hola - hello');
    await user.click(await screen.findByRole('button', { name: 'Create 1 card' }));
    await screen.findByText('Created 1 card');

    const [card] = await repo.listCards(deck.id);
    expect(card).toMatchObject({ front: 'hello', back: 'hola', type: 'reversible' });
    const items = await repo.getReviewItemsForCard(card.id);
    expect(items.map((i) => i.variant).sort()).toEqual(['fwd', 'rev']);
  });

  it('shows an inline error when saving fails', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await setup(`/import?mode=paste&deck=${deck.id}`, [deck]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(repo, 'saveCards').mockRejectedValue(new Error('boom'));
    await paste('a - b');
    await user.click(await screen.findByRole('button', { name: 'Create 1 card' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the cards.');
    expect(screen.getByLabelText('Your list')).toBeInTheDocument();
  });

  it('shows the placeholder page without the dialog when not in paste mode', async () => {
    const user = userEvent.setup();
    await setup('/import', [mkDeck()]);
    expect(screen.getByText('More import options coming soon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your list')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Paste a list' }));
    expect(await screen.findByLabelText('Your list')).toBeInTheDocument();
  });
});
