import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';
import ToastRegion from '../../src/ui/components/ToastRegion';

afterEach(cleanup);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function mkFolder(over: Partial<Folder> = {}): Folder {
  return { ...baseRecord(), parentId: null, name: 'F', description: '', color: '#6366f1', emoji: '📁', order: 0, ...over };
}
function mkDeck(over: Partial<Deck> = {}): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'D', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

function renderAt(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}><RouterProvider router={router} /></SettingsContext.Provider>);
  return router;
}

async function fillAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Name'), name);
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function dnd() {
  const data: Record<string, string> = {};
  const dataTransfer = {
    setData: (k: string, v: string) => { data[k] = v; },
    getData: (k: string) => data[k] ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  return { dataTransfer, row };
}

describe('library', () => {
  it('create folder then deck inside it appears nested', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'New folder' }));
    await fillAndSave(user, 'Languages');

    await user.click(await screen.findByRole('link', { name: /Languages/ }));
    expect(await screen.findByRole('heading', { name: /Languages/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New deck' }));
    await fillAndSave(user, 'Spanish');
    expect(await screen.findByRole('link', { name: /Spanish/ })).toBeInTheDocument();

    const folder = (await repo.listFolders())[0];
    expect((await repo.listDecks())[0].folderId).toBe(folder.id);

    await user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Library' }));
    const folderItem = await screen.findByRole('link', { name: /Languages/ });
    const li = folderItem.closest('li')!;
    expect(within(li).getByRole('link', { name: /Spanish/ })).toBeInTheDocument();
  });

  it('delete deck then Undo restores it', async () => {
    const user = userEvent.setup();
    await repo.saveDeck(mkDeck({ name: 'Biology' }));
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'More actions for Biology' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: /Biology/ })).not.toBeInTheDocument());
    expect(await repo.listDecks()).toHaveLength(0);

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('link', { name: /Biology/ })).toBeInTheDocument();
    expect(await repo.listDecks()).toHaveLength(1);
  });

  it('empty library shows four onboarding actions', async () => {
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'Create deck' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paste a list' })).toHaveAttribute('href', '/import?mode=paste');
    expect(screen.getByRole('link', { name: 'Import a file' })).toHaveAttribute('href', '/import');
    const sample = screen.getByRole('button', { name: 'Try a sample deck' });
    expect(sample).toBeDisabled();
    expect(sample).toHaveAttribute('title', 'Coming soon');
  });

  it('moving folder into its own child is rejected', async () => {
    const user = userEvent.setup();
    const parent = mkFolder({ name: 'Parent' });
    const child = mkFolder({ name: 'Child', parentId: parent.id });
    await repo.saveFolder(parent);
    await repo.saveFolder(child);
    renderAt('/');

    await user.click(await screen.findByRole('button', { name: 'More actions for Parent' }));
    await user.click(screen.getByRole('button', { name: 'Move to…' }));
    const picker = await screen.findByRole('dialog');
    expect(within(picker).getByRole('button', { name: /Child/ })).toBeDisabled();
    expect(within(picker).getByRole('button', { name: /Parent/ })).toBeDisabled();
    expect(within(picker).getByRole('button', { name: /Top level/ })).toBeEnabled();
  });

  it('dropping a folder onto its own child is rejected with a toast', async () => {
    const parent = mkFolder({ name: 'Parent' });
    const child = mkFolder({ name: 'Child', parentId: parent.id });
    await repo.saveFolder(parent);
    await repo.saveFolder(child);
    renderAt('/');

    await screen.findByRole('link', { name: /Child/ });
    const { dataTransfer, row } = dnd();
    fireEvent.dragStart(within(row(parent.id)).getAllByRole('link')[0], { dataTransfer });
    fireEvent.dragOver(row(child.id), { dataTransfer });
    fireEvent.drop(row(child.id), { dataTransfer });

    expect(await screen.findByRole('status')).toHaveTextContent("Can't move a folder into itself");
    expect((await repo.listFolders()).find((f) => f.id === parent.id)!.parentId).toBeNull();
  });

  it('moving a deck into a folder via the picker works', async () => {
    const user = userEvent.setup();
    const folder = mkFolder({ name: 'Science' });
    const deck = mkDeck({ name: 'Biology' });
    await repo.saveFolder(folder);
    await repo.saveDeck(deck);
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'More actions for Biology' }));
    await user.click(screen.getByRole('button', { name: 'Move to…' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Science/ }));
    await waitFor(async () => expect((await repo.listDecks())[0].folderId).toBe(folder.id));
  });

  it('global search finds cards and links to the editor', async () => {
    const user = userEvent.setup();
    const deck = mkDeck({ name: 'Bio' });
    const card = mkCard(deck.id, { front: 'Mitochondria', back: 'Powerhouse' });
    await repo.saveDeck(deck);
    await repo.saveCard(card);
    renderAt('/');
    await user.click(await screen.findByRole('searchbox', { name: 'Search cards' }));
    await user.keyboard('mito');
    const link = await screen.findByRole('link', { name: /Mitochondria/ });
    expect(link).toHaveAttribute('href', `/deck/${deck.id}/edit/${card.id}`);
  });

  it('dropping a deck onto a folder moves it there', async () => {
    const folder = mkFolder({ name: 'Science' });
    const deck = mkDeck({ name: 'Biology' });
    await repo.saveFolder(folder);
    await repo.saveDeck(deck);
    renderAt('/');
    await screen.findByRole('link', { name: /Biology/ });
    const { dataTransfer, row } = dnd();
    fireEvent.dragStart(row(deck.id), { dataTransfer });
    fireEvent.dragOver(row(folder.id), { dataTransfer });
    fireEvent.drop(row(folder.id), { dataTransfer });
    await waitFor(async () => expect((await repo.listDecks())[0].folderId).toBe(folder.id));
  });

  it('in a folder view, dropping on a sibling deck or empty area keeps the item in that folder', async () => {
    const folder = mkFolder({ name: 'Science' });
    const a = mkDeck({ name: 'Alpha', folderId: folder.id });
    const b = mkDeck({ name: 'Beta', folderId: folder.id });
    await repo.saveFolder(folder);
    await repo.saveDeck(a);
    await repo.saveDeck(b);
    renderAt(`/folder/${folder.id}`);
    await screen.findByRole('link', { name: /Beta/ });
    const { dataTransfer, row } = dnd();

    fireEvent.dragStart(row(a.id), { dataTransfer });
    fireEvent.dragOver(row(b.id), { dataTransfer });
    fireEvent.drop(row(b.id), { dataTransfer });
    fireEvent.dragStart(row(a.id), { dataTransfer });
    fireEvent.drop(row(a.id).closest('ul')!.parentElement!, { dataTransfer });

    await new Promise((r) => setTimeout(r, 50));
    const decks = await repo.listDecks();
    expect(decks.every((d) => d.folderId === folder.id)).toBe(true);
  });

  it('keeps both Undo toasts when deleting twice', async () => {
    const user = userEvent.setup();
    await repo.saveDeck(mkDeck({ name: 'One' }));
    await repo.saveDeck(mkDeck({ name: 'Two' }));
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'More actions for One' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'More actions for Two' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2));
  });

  it('menu moves focus in, and Escape returns it to the trigger', async () => {
    const user = userEvent.setup();
    await repo.saveDeck(mkDeck({ name: 'Biology' }));
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: 'More actions for Biology' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('closing a dialog returns focus to the menu trigger', async () => {
    const user = userEvent.setup();
    await repo.saveDeck(mkDeck({ name: 'Biology' }));
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: 'More actions for Biology' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('shows an alert in the dialog when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(repo, 'saveDeck').mockRejectedValue(new Error('boom'));
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'New deck' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('ToastRegion', () => {
  afterEach(() => vi.useRealTimers());

  it('re-rendering does not reset the auto-dismiss timer', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const toast = { id: 1, message: 'Hi', durationMs: 1000 };
    const { rerender } = render(<ToastRegion toasts={[toast]} onClose={first} />);
    vi.advanceTimersByTime(600);
    rerender(<ToastRegion toasts={[toast]} onClose={second} />);
    vi.advanceTimersByTime(399);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
