import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';

let blobs: Blob[];
let revoked: ReturnType<typeof vi.fn>;
let clicked: string[];

beforeEach(async () => {
  await db.delete();
  await db.open();
  blobs = [];
  clicked = [];
  revoked = vi.fn();
  URL.createObjectURL = (b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return 'blob:test';
  };
  URL.revokeObjectURL = revoked as unknown as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const deck: Deck = {
  ...baseRecord(), folderId: null, name: 'Café 日本', description: '', color: '#6366f1', emoji: '📚', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
};
const card: Card = {
  ...baseRecord(), deckId: deck.id, type: 'basic', front: 'é', back: 'ü', distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
};

describe('export menu', () => {
  it('downloads a BOM-prefixed CSV with a slugged dated filename and revokes the URL', async () => {
    await repo.saveDeck(deck);
    await repo.saveCards([card]);
    render(<SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/deck/${deck.id}`] })} /></SettingsContext.Provider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Export…' }));
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:test'));
    expect(clicked[0]).toMatch(/^flashcards-cafe-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(blobs[0]);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('library export offers JSON only; a deck export also offers CSV, share and print', async () => {
    render(<SettingsContext.Provider value={[DEFAULT_SETTINGS, () => undefined]}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} /></SettingsContext.Provider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Export…' }));
    expect(screen.getByRole('button', { name: 'Download JSON backup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Include study history' }));
    await user.click(screen.getByRole('button', { name: 'Download JSON backup' }));
    await waitFor(() => expect(clicked[0]).toMatch(/^flashcards-library-\d{4}-\d{2}-\d{2}\.json$/));
  });
});
