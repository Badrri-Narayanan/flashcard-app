import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { StorageFullError } from '../../src/data/repository';
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

async function upload(text: string) {
  const user = userEvent.setup();
  const file = new File([text], 'cards.csv', { type: 'text/csv' });
  await user.upload(await screen.findByLabelText('CSV file'), file);
  return user;
}

describe('csv import dialog', () => {
  it('changing a column mapping changes the preview', async () => {
    await setup('/import?mode=csv', [mkDeck()]);
    const user = await upload('hola,hello\nadios,bye');
    const table = await screen.findByRole('table', { name: 'Preview' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/^holahello/);

    await user.selectOptions(screen.getByLabelText('Column 1'), 'Back');
    await user.selectOptions(screen.getByLabelText('Column 2'), 'Front');
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Preview' })).getAllByRole('row')[1]).toHaveTextContent(/^hellohola/));
  });

  it('warns about skipped rows and imports only the valid ones', async () => {
    const deck = mkDeck();
    await setup(`/import?mode=csv&deck=${deck.id}`, [deck]);
    const user = await upload('front,back\nhola,hello\n,orphan\nlonely,\n');
    expect(await screen.findByText('2 rows skipped (missing front or back)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 1 card' }));
    expect(await screen.findByText('Imported 1 card')).toBeInTheDocument();
    expect((await repo.listCards(deck.id)).map((c) => c.front)).toEqual(['hola']);
  });

  it('creates the cards in a new deck', async () => {
    await setup('/import?mode=csv', [mkDeck()]);
    const user = await upload('front,back,tags,type\nhola,hello,greet basics,reversible\n');
    await user.selectOptions(await screen.findByLabelText('Add to deck'), 'New deck…');
    await user.click(screen.getByRole('button', { name: 'Import 1 card' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a deck name.');
    await user.type(screen.getByLabelText('New deck name'), 'Imported');
    await user.click(screen.getByRole('button', { name: 'Import 1 card' }));
    expect(await screen.findByText('Imported 1 card')).toBeInTheDocument();

    const created = (await repo.listDecks()).find((d) => d.name === 'Imported');
    expect(created?.color).not.toBe('');
    const cards = await repo.listCards(created!.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ front: 'hola', back: 'hello', tags: ['greet', 'basics'], type: 'reversible' });
  });

  it('shows a storage-full message when saving hits the quota', async () => {
    const deck = mkDeck();
    await setup(`/import?mode=csv&deck=${deck.id}`, [deck]);
    const user = await upload('a,b\n');
    vi.spyOn(repo, 'transaction').mockRejectedValue(new StorageFullError());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(await screen.findByRole('button', { name: 'Import 1 card' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your device storage is full');
  });
});
