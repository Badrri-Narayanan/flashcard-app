import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { buildSharePayload, encodeShare } from '../../src/domain/share';
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

const mkDeck = (over: Partial<Deck> = {}): Deck => ({
  ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
});
const mkCard = (deckId: string, over: Partial<Card> = {}): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: 'hola', back: 'hello', distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
});

function linkFor(deck: Deck, cards: Card[]): string {
  return `/share/${encodeShare(buildSharePayload(deck, cards, () => undefined).payload)}`;
}
function open(path: string) {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('share preview', () => {
  it('shows name, card count and the first 5 cards, and offers Add for an unknown deck', async () => {
    const source = mkDeck({ name: 'French' });
    const cards = Array.from({ length: 7 }, (_, i) => mkCard(source.id, { front: `front-${i}` }));
    open(linkFor(source, cards));
    expect(await screen.findByRole('heading', { name: /French/ })).toBeInTheDocument();
    expect(screen.getByText(/7 cards/)).toBeInTheDocument();
    expect(screen.getByText('front-4')).toBeInTheDocument();
    expect(screen.queryByText('front-5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to my library' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update my copy' })).not.toBeInTheDocument();
  });

  it('says how many damaged cards in the link will be left out', async () => {
    const source = mkDeck();
    const { payload } = buildSharePayload(source, [mkCard(source.id)], () => undefined);
    const hostile = { ...payload, cards: [...payload.cards, { ...payload.cards[0], id: 'bad', front: 1 }] };
    open(`/share/${encodeShare(hostile as never)}`);
    expect(await screen.findByText('1 damaged item in this link will be left out.')).toBeInTheDocument();
    expect(screen.getByText(/1 card/)).toBeInTheDocument();
  });

  it('re-opening link offers Update when the deck was added from it', async () => {
    const source = mkDeck({ name: 'French' });
    const link = linkFor(source, [mkCard(source.id)]);
    const user = userEvent.setup();
    const { unmount } = open(link);
    await user.click(await screen.findByRole('button', { name: 'Add to my library' }));
    await user.click(await screen.findByRole('button', { name: 'Top level' }));
    expect(await screen.findByText('Added “French” to your library.')).toBeInTheDocument();

    const added = (await repo.listDecks()).find((d) => d.name === 'French');
    expect(added).toMatchObject({ id: source.id, sourceId: source.id });
    expect(await repo.listCards(source.id)).toHaveLength(1);

    unmount();
    open(link);
    expect(await screen.findByRole('button', { name: 'Update my copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add as new copy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to my library' })).not.toBeInTheDocument();
  });

  it('adds a copy with new ids that still points at the shared deck, and then offers only a new copy', async () => {
    const source = mkDeck({ name: 'French' });
    const link = linkFor(source, [mkCard(source.id)]);
    await repo.saveDeck(source); // same id already local -> copy mode
    const user = userEvent.setup();
    const { unmount } = open(link);
    await user.click(await screen.findByRole('button', { name: 'Add as new copy' }));
    await user.click(await screen.findByRole('button', { name: 'Top level' }));
    await screen.findByText('Added “French” to your library.');
    const decks = await repo.listDecks();
    const copy = decks.find((d) => d.id !== source.id);
    expect(decks).toHaveLength(2);
    expect(copy?.sourceId).toBe(source.id);

    unmount();
    await repo.deleteDeck(source.id);
    open(link);
    expect(await screen.findByRole('button', { name: 'Add as new copy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update my copy' })).not.toBeInTheDocument();
  });

  it('never renders remote or stored images in the preview', async () => {
    const source = mkDeck();
    const cards = [
      mkCard(source.id, { front: '![x](https://example.com/a.png) ![y][r]\n\n[r]: https://example.com/b.png', back: '![z](media:abc)' }),
    ];
    const { container } = open(linkFor(source, cards));
    await screen.findByRole('heading', { name: /Spanish/ });
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getAllByText('[image]').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a friendly message with a way home for a truncated link', async () => {
    const source = mkDeck();
    const cards = Array.from({ length: 20 }, (_, i) => mkCard(source.id, { front: `q${i}-${Math.random()}` }));
    const full = linkFor(source, cards);
    open(full.slice(0, full.length / 2));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete|not a valid/);
    expect(screen.getByRole('link', { name: 'Back to Library' })).toBeInTheDocument();
  });
});

describe('share dialog', () => {
  it('shows a short link without a warning', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCard(mkCard(deck.id));
    const user = userEvent.setup();
    open(`/deck/${deck.id}`);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    const input = await screen.findByLabelText('Share link');
    expect((input as HTMLInputElement).value).toContain('#/share/');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR code for the share link' })).toBeInTheDocument();
    expect(screen.queryByText(/may not work in some chat apps/)).not.toBeInTheDocument();
  });

  it('warns above the warning threshold and drops the QR code', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const noise = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    await repo.saveCards(Array.from({ length: 20 }, () => mkCard(deck.id, { back: noise(700) })));
    const user = userEvent.setup();
    open(`/deck/${deck.id}`);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByText(/may not work in some chat apps/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON file' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'QR code for the share link' })).not.toBeInTheDocument());
  });
});
