import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder } from '../../src/domain/types';
import { routes } from '../../src/ui/routes';

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
  render(<RouterProvider router={router} />);
  return router;
}

async function fillAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Name'), name);
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    const tree = await screen.findByRole('tree');
    const folderItem = within(tree).getByRole('treeitem', { name: /Languages/ });
    expect(within(folderItem).getByRole('link', { name: /Spanish/ })).toBeInTheDocument();
  });

  it('delete deck then Undo restores it', async () => {
    const user = userEvent.setup();
    await repo.saveDeck(mkDeck({ name: 'Biology' }));
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'More actions for Biology' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

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
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
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

    const rows = await screen.findAllByRole('treeitem');
    const parentRow = rows.find((r) => r.getAttribute('data-node-id') === parent.id)!;
    const childRow = rows.find((r) => r.getAttribute('data-node-id') === child.id)!;
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => { data[k] = v; },
      getData: (k: string) => data[k] ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(within(parentRow).getAllByRole('link')[0], { dataTransfer });
    fireEvent.dragOver(childRow, { dataTransfer });
    fireEvent.drop(childRow, { dataTransfer });

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
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
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
});
