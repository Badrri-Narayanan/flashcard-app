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
  vi.unstubAllGlobals();
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
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

async function setup(path?: string, deck = mkDeck()) {
  await repo.saveDeck(deck);
  const router = createMemoryRouter(routes, { initialEntries: [path ?? `/deck/${deck.id}/edit`] });
  render(<RouterProvider router={router} />);
  return { deck, router };
}

const front = () => screen.findByLabelText(/^(Front|Text|Question)$/);

describe('card editor', () => {
  it('Save & add another clears fields and keeps type and tags', async () => {
    const user = userEvent.setup();
    const { deck } = await setup();
    await user.selectOptions(await screen.findByLabelText('Card type'), 'reversible');
    await user.type(screen.getByLabelText('Tags'), 'verbs,');
    await user.type(await front(), 'hola');
    await user.type(screen.getByLabelText('Back'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Save & add another' }));

    expect(await screen.findByText('Card saved')).toBeInTheDocument();
    expect(await front()).toHaveValue('');
    expect(screen.getByLabelText('Back')).toHaveValue('');
    expect(screen.getByLabelText('Card type')).toHaveValue('reversible');
    expect(screen.getByRole('button', { name: 'Remove tag verbs' })).toBeInTheDocument();
    expect(await front()).toHaveFocus();

    const cards = await repo.listCards(deck.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ front: 'hola', back: 'hello', type: 'reversible', tags: ['verbs'] });
  });

  it('Ctrl+Enter saves and adds another', async () => {
    const user = userEvent.setup();
    const { deck } = await setup();
    await user.type(await front(), 'one');
    await user.type(screen.getByLabelText('Back'), 'uno');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(async () => expect(await repo.listCards(deck.id)).toHaveLength(1));
    expect(await front()).toHaveValue('');
  });

  it('Save navigates back to the deck', async () => {
    const user = userEvent.setup();
    const { deck, router } = await setup();
    await user.type(await front(), 'one');
    await user.type(screen.getByLabelText('Back'), 'uno');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deck/${deck.id}`));
    expect(await screen.findByRole('heading', { name: /Spanish/ })).toBeInTheDocument();
  });

  it('requires a front', async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual(['Please enter the front of the card.', 'Please enter the back of the card.']);
  });

  it('requires a back for basic cards and a correct answer for mcq', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(await front(), 'q');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the back of the card.');
    await user.selectOptions(screen.getByLabelText('Card type'), 'mcq');
    await user.type(screen.getByLabelText('Wrong answer 1'), 'w');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the correct answer.');
  });

  it('dirty Cancel asks to discard; clean Cancel leaves immediately', async () => {
    const user = userEvent.setup();
    const { deck, router } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deck/${deck.id}`));
  });

  it('dirty Cancel shows the discard confirmation', async () => {
    const user = userEvent.setup();
    const { deck, router } = await setup();
    await user.type(await front(), 'draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(router.state.location.pathname).toBe(`/deck/${deck.id}/edit`);
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deck/${deck.id}`));
    expect(await repo.listCards(deck.id)).toHaveLength(0);
  });

  it('pending tag text is saved with the card', async () => {
    const user = userEvent.setup();
    const { deck } = await setup();
    await user.type(await front(), 'q');
    await user.type(screen.getByLabelText('Back'), 'a');
    await user.type(screen.getByLabelText('Tags'), 'pending');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(async () => expect((await repo.listCards(deck.id))[0]?.tags).toEqual(['pending']));
  });

  it('mnemonic disclosure stays open after the text is cleared', async () => {
    const user = userEvent.setup();
    await setup();
    const summary = await screen.findByText('Add a memory hook');
    await user.click(summary);
    const details = summary.closest('details')!;
    await waitFor(() => expect(details.open).toBe(true));
    await user.type(screen.getByLabelText('Memory hook'), 'x');
    await user.clear(screen.getByLabelText('Memory hook'));
    expect(details.open).toBe(true);
  });

  it('cloze type with no blanks shows validation message, and Make blank wraps the selection', async () => {
    const user = userEvent.setup();
    const { deck } = await setup();
    await user.selectOptions(await screen.findByLabelText('Card type'), 'cloze');
    const text = (await front()) as HTMLTextAreaElement;
    expect(screen.queryByLabelText('Front')).not.toBeInTheDocument();
    await user.type(text, 'Madrid is the capital of Spain');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one blank/);

    text.setSelectionRange(0, 6);
    await user.click(screen.getByRole('button', { name: 'Make blank' }));
    expect(text).toHaveValue('{{c1::Madrid}} is the capital of Spain');
    text.setSelectionRange(text.value.indexOf('Spain'), text.value.length);
    await user.click(screen.getByRole('button', { name: 'Make blank' }));
    expect(text).toHaveValue('{{c1::Madrid}} is the capital of {{c2::Spain}}');

    await user.click(screen.getByRole('button', { name: 'Save & add another' }));
    await waitFor(async () => expect(await repo.listCards(deck.id)).toHaveLength(1));
  });

  it('mcq requires at least 1 distractor', async () => {
    const user = userEvent.setup();
    const { deck } = await setup();
    await user.selectOptions(await screen.findByLabelText('Card type'), 'mcq');
    await user.type(await front(), 'Capital of Spain?');
    await user.type(screen.getByLabelText('Correct answer'), 'Madrid');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one wrong answer.');

    await user.type(screen.getByLabelText('Wrong answer 1'), 'Paris');
    await user.click(screen.getByRole('button', { name: 'Add wrong answer' }));
    await user.type(screen.getByLabelText('Wrong answer 2'), 'Rome');
    await user.click(screen.getByRole('button', { name: 'Save & add another' }));
    await waitFor(async () => expect((await repo.listCards(deck.id))[0]?.distractors).toEqual(['Paris', 'Rome']));
  });

  it('shows an inline error when saving fails', async () => {
    const user = userEvent.setup();
    await setup();
    vi.spyOn(repo, 'saveCard').mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.type(await front(), 'x');
    await user.type(screen.getByLabelText('Back'), 'y');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the card');
  });

  it('pasted image is stored and inserted as Markdown at the cursor', async () => {
    const user = userEvent.setup();
    await setup();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: () => {} })));
    const field = (await front()) as HTMLTextAreaElement;
    await user.type(field, 'ab');
    field.setSelectionRange(1, 1);
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    fireEvent.paste(field, { clipboardData: { files: [file] } });
    await waitFor(() => expect(field.value).toMatch(/^a!\[image\]\(media:[0-9a-f-]{36}\)b$/));
    const id = /media:([0-9a-f-]{36})/.exec(field.value)![1];
    expect(await repo.getMedia(id)).toBeDefined();
  });

  it('changing type on a card with progress asks for confirmation', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id);
    await repo.saveCard(card);
    const [item] = await repo.getReviewItemsForCard(card.id);
    await db.reviewItems.put({ ...item, reps: 3 });
    await setup(`/deck/${deck.id}/edit/${card.id}`, deck);

    await user.selectOptions(await screen.findByLabelText('Card type'), 'reversible');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('already has study progress');
    expect((await repo.getCard(card.id))!.type).toBe('basic');

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await repo.listCards(deck.id)).toHaveLength(1);
    expect((await repo.getCard(card.id))!.type).toBe('basic');
    await user.click(within(dialog).getByRole('button', { name: 'Change type' }));
    await waitFor(async () => expect((await repo.getCard(card.id))!.type).toBe('reversible'));
  });

  it('changing type on a card without progress saves directly', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const card = mkCard(deck.id);
    await repo.saveCard(card);
    await setup(`/deck/${deck.id}/edit/${card.id}`, deck);
    await user.selectOptions(await screen.findByLabelText('Card type'), 'reversible');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await repo.getCard(card.id))!.type).toBe('reversible'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('deck page', () => {
  it('empty deck shows empty state with add and paste actions', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const router = createMemoryRouter(routes, { initialEntries: [`/deck/${deck.id}`] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('No cards yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paste a list' })).toHaveAttribute('href', `/import?mode=paste&deck=${deck.id}`);
    expect(screen.getAllByRole('link', { name: 'Add card' })[0]).toHaveAttribute('href', `/deck/${deck.id}/edit`);
    expect(screen.getAllByRole('link', { name: 'Study' }).map((a) => a.getAttribute('href'))).toContain(`/study/deck/${deck.id}/learn`);
  });

  it('lists cards with previews, searches, filters by tag, and deletes with undo', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCard(mkCard(deck.id, { front: '**Hola** `mundo`', tags: ['greet'] }));
    await repo.saveCard(mkCard(deck.id, { front: 'Gracias', tags: ['polite'], type: 'cloze' }));
    const router = createMemoryRouter(routes, { initialEntries: [`/deck/${deck.id}`] });
    render(<RouterProvider router={router} />);

    const list = await screen.findByRole('list', { name: 'Cards' });
    expect(within(list).getByText('Hola mundo')).toBeInTheDocument();
    expect(within(list).getByText('Fill-in-blank')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'grac');
    expect(within(list).queryByText('Hola mundo')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'greet' }));
    expect(within(await screen.findByRole('list', { name: 'Cards' })).queryByText('Gracias')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'greet' }));

    await user.click(screen.getByRole('button', { name: /Delete card “Gracias”/ }));
    await waitFor(async () => expect(await repo.listCards(deck.id)).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await repo.listCards(deck.id)).toHaveLength(2));

    await user.click(screen.getByText('Hola mundo'));
    expect(router.state.location.pathname).toMatch(new RegExp(`/deck/${deck.id}/edit/.+`));
  });
});
