import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const mkDeck = (): Deck => ({
  ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
});
const mkCard = (deckId: string, n: number): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: `q${n}`, back: `a${n}`, distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
});

function backupJson(cardCount: number): string {
  const deck = mkDeck();
  return JSON.stringify({
    app: 'flashcards', schemaVersion: 1, exportedAt: Date.now(), scope: 'deck',
    folders: [], decks: [deck], cards: Array.from({ length: cardCount }, (_, i) => mkCard(deck.id, i)), media: [],
  });
}

async function setup(path = '/import') {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
  return { page: await screen.findByTestId('import-page') };
}

const drop = (target: HTMLElement, file: File) => fireEvent.drop(target, { dataTransfer: { files: [file], types: ['Files'] } });

describe('import page', () => {
  it('dropping a .csv opens the CSV dialog with the file loaded', async () => {
    await repo.saveDeck(mkDeck());
    const { page } = await setup();
    drop(page, new File(['hola,hello\nadios,bye'], 'cards.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('dialog', { name: 'Import a CSV file' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Preview' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/^holahello/);
  });

  it('dropping a .txt opens the paste dialog prefilled with its text', async () => {
    await repo.saveDeck(mkDeck());
    const { page } = await setup();
    drop(page, new File(['hola - hello'], 'words.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('dialog', { name: 'Paste a list' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your list' })).toHaveValue('hola - hello'));
  });

  it('shows a message for an unsupported file type', async () => {
    const { page } = await setup();
    drop(page, new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(await screen.findByText('“photo.png” is not supported. Drop a .txt, .csv, .tsv or .json file.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('JSON import shows the summary', async () => {
    const { page } = await setup('/import?mode=json');
    void page;
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Backup JSON file'), new File([backupJson(11)], 'backup.json', { type: 'application/json' }));
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Added 12, updated 0, skipped 0')).toBeInTheDocument();
    expect(await repo.listCards((await repo.listDecks())[0].id)).toHaveLength(11);
  });

  it('a dropped .json goes through the JSON flow', async () => {
    const { page } = await setup();
    drop(page, new File([backupJson(2)], 'backup.json', { type: 'application/json' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Added 3, updated 0, skipped 0')).toBeInTheDocument();
  });

  it('malformed JSON shows an error and writes nothing', async () => {
    await setup('/import?mode=json');
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Backup JSON file'), new File(['{not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON');
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(await repo.listDecks()).toHaveLength(0);
    expect(await db.cards.count()).toBe(0);
  });
});
