import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, RouterProvider, Routes, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { StorageFullError } from '../../src/data/repository';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import BackupReminder from '../../src/ui/components/BackupReminder';
import StorageBanner from '../../src/ui/components/StorageBanner';
import StorageErrorProvider from '../../src/ui/components/StorageErrorProvider';
import { useStorageErrors } from '../../src/ui/components/storageError';
import UpdatePrompt from '../../src/ui/components/UpdatePrompt';
import OnboardingEmpty from '../../src/ui/library/OnboardingEmpty';
import { SAMPLE_FOLDER_ID } from '../../src/data/seed';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

const sw = vi.hoisted(() => ({ needRefresh: false, update: vi.fn() }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: sw.update,
  }),
}));

const runExport = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/library/runExport', () => ({ runExport }));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await db.delete();
  await db.open();
  sw.needRefresh = false;
  sw.update.mockReset();
  runExport.mockReset();
  runExport.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function seedCards(n: number) {
  const deck: Deck = {
    ...baseRecord(), folderId: null, name: 'D', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
  };
  await repo.saveDeck(deck);
  const cards: Card[] = Array.from({ length: n }, (_, i) => ({
    ...baseRecord(), deckId: deck.id, type: 'basic', front: `q${i}`, back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
  }));
  await repo.saveCards(cards);
}

function Reporter({ error }: { error: unknown }) {
  const { reportStorageError } = useStorageErrors();
  return <button type="button" onClick={() => reportStorageError(error)}>report</button>;
}

function renderBanner(error?: unknown) {
  return render(
    <StorageErrorProvider>
      <StorageBanner />
      {error !== undefined && <Reporter error={error} />}
    </StorageErrorProvider>,
  );
}

describe('StorageBanner', () => {
  it('storage banner appears on StorageFullError', async () => {
    const user = userEvent.setup();
    renderBanner(new StorageFullError());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i);
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument();
  });

  it('ignores unrelated errors', async () => {
    const user = userEvent.setup();
    renderBanner(new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'report' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows for a Dexie open failure reported by name', async () => {
    const user = userEvent.setup();
    renderBanner(Object.assign(new Error('x'), { name: 'DatabaseClosedError' }));
    await user.click(screen.getByRole('button', { name: 'report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/storage/i);
  });

  it('shows for an unhandled rejection with a storage error', async () => {
    renderBanner();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new StorageFullError();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows when the startup probe cannot open the database', async () => {
    vi.spyOn(repo, 'getKV').mockRejectedValue(Object.assign(new Error('x'), { name: 'OpenFailedError' }));
    renderBanner();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('exports the library from the banner and suggests freeing space when that fails', async () => {
    const user = userEvent.setup();
    renderBanner(new StorageFullError());
    await user.click(screen.getByRole('button', { name: 'report' }));
    await user.click(await screen.findByRole('button', { name: 'Export backup' }));
    expect(runExport).toHaveBeenCalledWith('library', null, 'json', false);

    runExport.mockRejectedValueOnce(new Error('nope'));
    await user.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(await screen.findByText(/freeing up/i)).toBeInTheDocument();
  });
});

describe('BackupReminder', () => {
  it('backup reminder shows at 50 cards with no backup', async () => {
    await seedCards(50);
    render(<BackupReminder />);
    expect(await screen.findByRole('status')).toHaveTextContent(/back up/i);
  });

  it('stays hidden below 50 cards', async () => {
    await seedCards(49);
    render(<BackupReminder />);
    await waitFor(() => expect(repo.countCards()).resolves.toBe(49));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays hidden after a recent backup but shows after more than 14 days', async () => {
    await seedCards(50);
    await repo.setKV('lastBackupAt', Date.now() - 3 * DAY);
    const first = render(<BackupReminder />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    first.unmount();

    await repo.setKV('lastBackupAt', Date.now() - 15 * DAY);
    render(<BackupReminder />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('does not touch the card table when the backup is recent or snoozed', async () => {
    await seedCards(50);
    const list = vi.spyOn(repo, 'listAllCards');
    const count = vi.spyOn(repo, 'countCards');
    await repo.setKV('lastBackupAt', Date.now() - DAY);
    const first = render(<BackupReminder />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    first.unmount();

    await repo.setKV('lastBackupAt', Date.now() - 30 * DAY);
    await repo.setKV('backupSnoozeUntil', Date.now() + DAY);
    render(<BackupReminder />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(list).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('dismiss snoozes for 7 days', async () => {
    const user = userEvent.setup();
    await seedCards(50);
    const first = render(<BackupReminder />);
    await user.click(await screen.findByRole('button', { name: 'Remind me later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const until = (await repo.getKV<number>('backupSnoozeUntil'))!;
    expect(until - Date.now()).toBeGreaterThan(7 * DAY - 60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(7 * DAY);
    first.unmount();

    render(<BackupReminder />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await repo.setKV('backupSnoozeUntil', Date.now() - 1000);
    cleanup();
    render(<BackupReminder />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('backs up the library from the reminder', async () => {
    const user = userEvent.setup();
    await seedCards(50);
    render(<BackupReminder />);
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    expect(runExport).toHaveBeenCalledWith('library', null, 'json', false);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});

describe('UpdatePrompt', () => {
  it('is hidden when no update is waiting', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
  });

  it('offers a reload when a new version is ready', async () => {
    sw.needRefresh = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sw.update).toHaveBeenCalledWith(true);
  });
});

describe('OnboardingEmpty sample button', () => {
  it('seeds the samples and opens the Samples folder', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<OnboardingEmpty onCreateDeck={() => undefined} />} />
          <Route path="/folder/:id" element={<p>folder view</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Try a sample deck' }));
    expect(await screen.findByText('folder view')).toBeInTheDocument();
    expect((await repo.listFolders()).map((f) => f.id)).toEqual([SAMPLE_FOLDER_ID]);
  });
});

describe('save failures', () => {
  it('a quota error while saving a card raises the storage banner', async () => {
    const user = userEvent.setup();
    await seedCards(1);
    const [deck] = await repo.listDecks();
    vi.spyOn(repo, 'saveCard').mockRejectedValue(new StorageFullError());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter(routes, { initialEntries: [`/deck/${deck.id}/edit`] });
    render(
      <StorageErrorProvider>
        <SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}><RouterProvider router={router} /></SettingsContext.Provider>
      </StorageErrorProvider>,
    );
    await user.type(await screen.findByLabelText('Front'), 'q');
    await user.type(screen.getByLabelText('Back'), 'a');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/storage is full/i)).toBeInTheDocument();
  });
});
