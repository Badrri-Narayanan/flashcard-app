import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import SettingsPage from '../../src/ui/settings/SettingsPage';
import { SettingsProvider } from '../../src/ui/settings/SettingsProvider';

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  document.documentElement.removeAttribute('style');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('changing font updates sample immediately', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Font'), 'hyperlegible');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Atkinson Hyperlegible');
    expect(screen.getByTestId('font-sample').style.fontFamily).toBe('var(--font-ui)');
  });

  it('card text size changes the sample card scale', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Card text size'), 'XL');
    expect(document.documentElement.style.getPropertyValue('--card-scale')).toBe('1.45');
  });

  it('reset requires typing RESET', async () => {
    const reset = vi.spyOn(repo, 'resetAll').mockResolvedValue();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, hash: '' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Reset app…' }));
    const confirm = screen.getByRole('button', { name: 'Reset everything' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Type RESET to confirm'), 'reset');
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText('Type RESET to confirm'));
    await user.type(screen.getByLabelText('Type RESET to confirm'), 'RESET');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(window.location.hash).toBe('#/');
  });

  it('shows Not available when navigator.storage is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    renderPage();
    expect(await screen.findAllByText('Not available')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Keep my data safe' })).not.toBeInTheDocument();
  });

  it('shows storage usage and persists on request', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { estimate: async () => ({ usage: 2048, quota: 1e9 }), persisted: async () => false, persist },
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('2.0 KB')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep my data safe' }));
    expect(persist).toHaveBeenCalled();
    expect(await screen.findByText('Protected')).toBeInTheDocument();
  });

  it('validates the daily goal and day start hour', async () => {
    const user = userEvent.setup();
    renderPage();
    const goal = screen.getByLabelText('Daily goal');
    await user.clear(goal);
    await user.type(goal, '0');
    expect(screen.getByText('Enter a whole number of 1 or more.')).toBeInTheDocument();
    await user.clear(goal);
    await user.type(goal, '30');
    await waitFor(async () => expect((await repo.getKV<{ dailyGoal: number }>('settings'))?.dailyGoal).toBe(30));
    const hour = screen.getByLabelText('Day starts at') as HTMLSelectElement;
    expect(hour.options).toHaveLength(24);
  });

  it('exports the library through the shared backup download', async () => {
    const deck = { ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '', order: 0, settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null };
    await repo.saveDeck(deck);
    const names: string[] = [];
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Export library' }));
    await waitFor(() => expect(names).toHaveLength(1));
    expect(names[0]).toMatch(/flashcards-library-.*\.json$/);
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import');
  });
});
