import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import { StorageErrorContext } from '../../src/ui/components/storageError';
import { routes } from '../../src/ui/routes';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';

const runExport = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/library/runExport', () => ({ runExport }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await db.delete();
  await db.open();
  runExport.mockReset();
  runExport.mockResolvedValue(undefined);
});

const mkDeck = (): Deck => ({
  ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '', emoji: '', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
});
const mkCard = (deckId: string, n: number): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: `question ${n}`, back: `answer ${n}`, distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
});

async function seed(n = 6) {
  const deck = mkDeck();
  await repo.saveDeck(deck);
  await repo.saveCards(Array.from({ length: n }, (_, i) => mkCard(deck.id, i + 1)));
  return deck;
}

const openFailure = () => Object.assign(new Error('cannot open'), { name: 'OpenFailedError' });

function renderAt(path: string, report = vi.fn()) {
  render(
    <StorageErrorContext.Provider value={{ issue: null, reportStorageError: report }}>
      <SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
      </SettingsContext.Provider>
    </StorageErrorContext.Provider>,
  );
  return report;
}

describe('route error screen', () => {
  it('replaces a page that cannot read its data with a friendly screen inside the app shell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(repo, 'listFolders').mockRejectedValue(openFailure());
    // React re-throws render errors through a window error event in development; keep jsdom from printing them.
    const quiet = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', quiet);
    onTestFinished(() => window.removeEventListener('error', quiet));
    const report = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Couldn’t read your data' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    await waitFor(() => expect(report).toHaveBeenCalledWith(expect.objectContaining({ name: 'OpenFailedError' })));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export backup' }));
    expect(runExport).toHaveBeenCalledWith('library', null, 'json', true);
  });
});

describe('study and print load failures', () => {
  it.each(['quiz', 'type', 'match'])('%s shows a load error with a working retry, not an empty deck', async (mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deck = await seed();
    const listCards = repo.listCards.bind(repo);
    vi.spyOn(repo, 'listCards').mockRejectedValueOnce(openFailure()).mockImplementation(listCards);
    const report = renderAt(`/study/deck/${deck.id}/${mode}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your cards.');
    await waitFor(() => expect(report).toHaveBeenCalled());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByText(/question \d/)).not.toHaveLength(0);
  });

  it('print shows a load error instead of spinning forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deck = await seed(2);
    const getDeck = repo.getDeck.bind(repo);
    vi.spyOn(repo, 'getDeck').mockRejectedValueOnce(openFailure()).mockImplementation(getDeck);
    renderAt(`/print/${deck.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your cards.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: /Spanish/ })).toBeInTheDocument();
  });
});
