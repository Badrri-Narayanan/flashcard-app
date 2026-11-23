import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, ReviewItem } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';
import { cardFaces } from '../../src/ui/study/faces';
import { swipeDecision } from '../../src/ui/study/swipe';

afterEach(cleanup);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function mkDeck(over: Partial<Deck> = {}, settings: Partial<Deck['settings']> = {}): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS, confidencePrompt: false, ...settings }, sourceId: null, matchBestMs: null, ...over,
  };
}
function mkCard(deckId: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}

async function seed(n: number, deckSettings: Partial<Deck['settings']> = {}, cardOver: Partial<Card> = {}) {
  const deck = mkDeck({}, deckSettings);
  await repo.saveDeck(deck);
  const cards: Card[] = [];
  for (let i = 1; i <= n; i++) {
    const card = mkCard(deck.id, { front: `question ${i}`, back: `answer ${i}`, ...cardOver });
    await repo.saveCard(card);
    cards.push(card);
  }
  return { deck, cards };
}

function renderAt(path: string, settings: Partial<AppSettings> = {}) {
  const value: [AppSettings, () => void] = [{ ...DEFAULT_SETTINGS, flipAnimation: false, ...settings }, () => undefined];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SettingsContext.Provider value={value}>
      <RouterProvider router={router} />
    </SettingsContext.Provider>,
  );
  return router;
}

async function currentQuestion(): Promise<string> {
  const el = await screen.findByText(/^question \d$/);
  return el.textContent ?? '';
}

describe('learn mode', () => {
  it('pressing 3 after reveal persists a log and advances', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(2);
    renderAt(`/study/deck/${deck.id}/learn`);
    const first = await currentQuestion();

    await user.keyboard('3');
    expect(await repo.listLogs()).toHaveLength(0);

    await user.keyboard(' ');
    expect(await screen.findByRole('group', { name: 'Rate your answer' })).toBeInTheDocument();
    await user.keyboard('3');

    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    const [log] = await repo.listLogs();
    expect(log).toMatchObject({ mode: 'learn', rating: 3, correct: true, confidence: null, deckId: deck.id });
    expect(log.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const item = (await db.reviewItems.get(log.reviewItemId))!;
    expect(item.reps).toBe(1);
    expect(item.state).not.toBe(0);

    await waitFor(async () => {
      const q = await currentQuestion();
      expect(q).not.toBe(first);
    });
  });

  it('rating buttons show interval previews and Hard counts as correct', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    const hard = await screen.findByRole('button', { name: /Hard/ });
    expect(hard).toHaveTextContent(/\d+[mhd]|<1m/);
    await user.click(hard);
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect((await repo.listLogs())[0]).toMatchObject({ rating: 2, correct: true });
  });

  it('swipe left after reveal rates Again', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(2);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await screen.findByRole('group', { name: 'Rate your answer' });

    const card = screen.getByRole('region', { name: 'Card' });
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientY: 100 };
    fireEvent.pointerDown(card, { ...pointer, clientX: 220 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 150 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 100 });
    fireEvent.pointerUp(card, { ...pointer, buttons: 0, clientX: 100 });

    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect((await repo.listLogs())[0]).toMatchObject({ rating: 1, correct: false });
  });

  it('swipe before reveal only flips', async () => {
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    const card = screen.getByRole('region', { name: 'Card' });
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientY: 100 };
    fireEvent.pointerDown(card, { ...pointer, clientX: 100 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 160 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 220 });
    fireEvent.pointerUp(card, { ...pointer, buttons: 0, clientX: 220 });
    expect(await screen.findByRole('group', { name: 'Rate your answer' })).toBeInTheDocument();
    expect(await repo.listLogs()).toHaveLength(0);
  });

  it('undo restores the previous item state and removes the log', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    const q = await currentQuestion();
    const before = (await db.reviewItems.toArray())[0];

    await user.keyboard(' ');
    await user.keyboard('3');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect((await db.reviewItems.get(before.id))!.reps).toBe(1);

    await user.click(await screen.findByRole('button', { name: 'Undo last answer' }));
    await waitFor(() => expect(screen.getByText(q)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo last answer' })).toBeDisabled());
    expect(await db.reviewItems.get(before.id)).toEqual(before);
    expect(await repo.listLogs()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Undo last answer' })).toBeDisabled();
  });

  it('z key undoes the last answer', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(2);
    renderAt(`/study/deck/${deck.id}/learn`);
    const q = await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('4');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    await user.keyboard('z');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(0));
    await waitFor(() => expect(screen.getByText(q)).toBeInTheDocument());
  });

  it('skips an item whose card was deleted mid-session', async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deck, cards } = await seed(3);
    renderAt(`/study/deck/${deck.id}/learn`);
    const first = await currentQuestion();
    const firstIndex = Number(first.split(' ')[1]) - 1;
    const victim = cards.find((_, i) => i !== firstIndex)!;
    await repo.deleteCards([victim.id]);

    await user.keyboard(' ');
    await user.keyboard('4');

    const next = await waitFor(async () => {
      const q = await currentQuestion();
      expect(q).not.toBe(first);
      return q;
    });
    expect(next).not.toBe(victim.front);
    await user.keyboard(' ');
    await user.keyboard('4');
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('shows confidence choices before reveal; choosing one reveals and is logged', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1, { confidencePrompt: true });
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.click(screen.getByRole('button', { name: 'Sure' }));
    expect(await screen.findByRole('group', { name: 'Rate your answer' })).toBeInTheDocument();
    await user.keyboard('3');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect((await repo.listLogs())[0].confidence).toBe('sure');
  });

  it('flipping without choosing records null confidence', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1, { confidencePrompt: true });
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('2');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    expect((await repo.listLogs())[0].confidence).toBeNull();
  });

  it('renders cloze blanks, then the answer and extra info after reveal', async () => {
    const user = userEvent.setup();
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCard(mkCard(deck.id, { type: 'cloze', front: 'The capital of France is {{c1::Paris}}', back: 'Europe note' }));
    renderAt(`/study/deck/${deck.id}/learn`);
    expect(await screen.findByText('[…]')).toBeInTheDocument();
    expect(screen.queryByText('Paris')).not.toBeInTheDocument();
    expect(screen.queryByText('Europe note')).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(await screen.findByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Europe note')).toBeInTheDocument();
  });

  it('shows the mnemonic only after reveal', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1, {}, { mnemonic: 'think of a bear' });
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    expect(screen.queryByText(/think of a bear/)).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(await screen.findByText(/think of a bear/)).toBeInTheDocument();
  });

  it('respects the new-cards-per-day limit and offers Study more with a summary', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3, { newPerDay: 1 });
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('4');
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(screen.getByText('Cards studied').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Accuracy').nextSibling).toHaveTextContent('100%');

    await user.click(await screen.findByRole('button', { name: 'Study more' }));
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('4');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(2));
  });

  it('shows All caught up with the next due time and Cram anyway / Back', async () => {
    const { deck } = await seed(1);
    const item = (await db.reviewItems.toArray())[0];
    await db.reviewItems.update(item.id, { state: 2, reps: 3, due: Date.now() + 2 * 86_400_000 + 3_600_000 });
    const router = renderAt(`/study/deck/${deck.id}/learn`);
    expect(await screen.findByText('All caught up!')).toBeInTheDocument();
    expect(screen.getByText('Next review in 2d')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', `/deck/${deck.id}`);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Cram anyway' }));
    expect(router.state.location.pathname).toBe(`/study/deck/${deck.id}/cram`);
  });

  it('? opens the keyboard help overlay', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('learn mode: review fixes', () => {
  it('exposes the question in a card region and the revealed answer in a live region', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    const region = await screen.findByRole('region', { name: 'Card' });
    expect(within(region).getByText('question 1')).toBeInTheDocument();
    expect(region.closest('[role="button"]')).toBeNull();
    await user.keyboard(' ');
    const answer = await within(region).findByText('answer 1');
    expect(answer.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
  });

  it('two rapid 3 presses and a double-click on Good write exactly one log', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('33');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(await repo.listLogs()).toHaveLength(1);

    await currentQuestion();
    await user.keyboard(' ');
    await user.dblClick(await screen.findByRole('button', { name: /Good/ }));
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(await repo.listLogs()).toHaveLength(2);
  });

  it('new cards are fetched per deck so a big old deck cannot starve another', async () => {
    const user = userEvent.setup();
    const a = mkDeck({ name: 'Old' }, { newPerDay: 3 });
    const b = mkDeck({ name: 'Newer' }, { newPerDay: 3 });
    await repo.saveDeck(a);
    await repo.saveDeck(b);
    for (let i = 0; i < 50; i++) await repo.saveCard(mkCard(a.id, { front: `question A${i}` }));
    for (let i = 0; i < 5; i++) await repo.saveCard(mkCard(b.id, { front: `question B${i}` }));
    const items = await db.reviewItems.toArray();
    await Promise.all(items.map((it: ReviewItem) => db.reviewItems.update(it.id, { due: it.deckId === a.id ? 1000 : 2000 })));
    renderAt('/study/folder/all/learn');
    await screen.findByText(/^question [AB]\d+$/);
    const seen = { A: 0, B: 0 };
    for (let i = 0; i < 6; i++) {
      const q = (await screen.findByText(/^question [AB]\d+$/)).textContent!;
      seen[q.includes('A') ? 'A' : 'B']++;
      await user.keyboard(' ');
      await user.keyboard('4');
      await waitFor(() => expect(screen.queryByText(q)).not.toBeInTheDocument());
    }
    expect(seen).toEqual({ A: 3, B: 3 });
  });

  it('summary offers Undo last answer, which returns to the session', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('4');
    await screen.findByText('Session complete');
    await user.click(screen.getByRole('button', { name: 'Undo last answer' }));
    await currentQuestion();
    expect(await repo.listLogs()).toHaveLength(0);
  });

  it('undo after a requeued answer restores the item and allows one fresh answer', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(2);
    renderAt(`/study/deck/${deck.id}/learn`);
    const q = await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('1');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    await user.keyboard('z');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(0));
    await waitFor(() => expect(screen.getByText(q)).toBeInTheDocument());
    await user.keyboard(' ');
    await user.keyboard('3');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
  });

  it('a save failure shows a toast and keeps the session', async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/learn`);
    const q = await currentQuestion();
    const spy = vi.spyOn(repo, 'saveReview').mockRejectedValueOnce(new Error('boom'));
    await user.keyboard(' ');
    await user.keyboard('3');
    expect(await screen.findByText(/Couldn.t save/)).toBeInTheDocument();
    expect(screen.getByText(q)).toBeInTheDocument();
    spy.mockRestore();
    await user.keyboard('3');
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    errors.mockRestore();
  });

  it('says Daily limit reached when the new-card limit is used up', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3, { newPerDay: 1 });
    renderAt(`/study/deck/${deck.id}/learn`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('4');
    await screen.findByText('Session complete');
    cleanup();
    renderAt(`/study/deck/${deck.id}/learn`);
    expect(await screen.findByText('Daily limit reached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Study more' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cram anyway' })).toBeInTheDocument();
  });
});

describe('cram mode', () => {
  it('double-tapping Got it writes one log; swiping right marks Got it', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3);
    renderAt(`/study/deck/${deck.id}/cram`);
    await currentQuestion();
    await user.keyboard(' ');
    await user.dblClick(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(await repo.listLogs()).toHaveLength(1);

    await currentQuestion();
    await user.keyboard(' ');
    await screen.findByRole('button', { name: 'Got it' });
    const card = screen.getByRole('region', { name: 'Card' });
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientY: 100 };
    fireEvent.pointerDown(card, { ...pointer, clientX: 100 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 160 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 220 });
    fireEvent.pointerUp(card, { ...pointer, buttons: 0, clientX: 220 });
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(2));
    expect((await repo.listLogs()).every((l) => l.correct)).toBe(true);
  });

  it('writes cram logs with null rating and never changes review items', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(2);
    const before = await db.reviewItems.toArray();
    renderAt(`/study/deck/${deck.id}/cram`);
    await currentQuestion();

    await user.click(screen.getByRole('button', { name: 'Flip card' }));
    await user.click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(async () => expect(await repo.listLogs()).toHaveLength(1));
    await currentQuestion();
    await user.keyboard(' ');
    await user.keyboard('1');
    expect(await screen.findByText('Session complete')).toBeInTheDocument();

    const logs = await repo.listLogs();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.mode === 'cram' && l.rating === null)).toBe(true);
    expect(logs.map((l) => l.correct).sort()).toEqual([false, true]);
    const after = await db.reviewItems.toArray();
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after.map((i) => i.due).sort()).toEqual(before.map((i) => i.due).sort());
    expect(after.every((i) => i.state === 0 && i.reps === 0)).toBe(true);
  });

  it('Next and Prev move through the shuffled cards', async () => {
    const user = userEvent.setup();
    const { deck } = await seed(3);
    renderAt(`/study/deck/${deck.id}/cram`);
    const first = await currentQuestion();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(async () => expect(await currentQuestion()).not.toBe(first));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(async () => expect(await currentQuestion()).toBe(first));
    expect(await repo.listLogs()).toHaveLength(0);
  });
});

describe('study home', () => {
  it('lists decks with counts and links to study them', async () => {
    const { deck } = await seed(2);
    renderAt('/study');
    expect(await screen.findByText(/2 new/)).toBeInTheDocument();
    const modes = screen.getByRole('navigation', { name: 'Study modes for Spanish' });
    expect(within(modes).getByRole('link', { name: 'Learn' })).toHaveAttribute('href', `/study/deck/${deck.id}/learn`);
    expect(screen.getByRole('link', { name: 'Study everything due' })).toHaveAttribute('href', '/study/folder/all/learn');
  });

  it('shows All caught up with the next due time when nothing is due or new', async () => {
    await seed(1);
    const item = (await db.reviewItems.toArray())[0];
    await db.reviewItems.update(item.id, { state: 2, reps: 3, due: Date.now() + 2 * 86_400_000 + 3_600_000 });
    renderAt('/study');
    expect(await screen.findByText('All caught up!')).toBeInTheDocument();
    expect(await screen.findByText('Next review in 2d')).toBeInTheDocument();
  });

  it('shows the empty message when there are no decks', async () => {
    renderAt('/study');
    expect(await screen.findByText(/No decks yet/)).toBeInTheDocument();
  });

  it('unknown modes render the coming soon note', async () => {
    const { deck } = await seed(1);
    renderAt(`/study/deck/${deck.id}/nope`);
    expect(await screen.findByRole('heading', { name: 'Coming soon' })).toBeInTheDocument();
  });

  it('folder scope "all" studies every deck', async () => {
    await seed(1);
    renderAt('/study/folder/all/learn');
    expect(await currentQuestion()).toMatch(/question 1/);
  });
});

describe('pure helpers', () => {
  it('swipeDecision: 80px threshold, flip before reveal', () => {
    expect(swipeDecision(79, true)).toBeNull();
    expect(swipeDecision(80, true)).toBe(3);
    expect(swipeDecision(-80, true)).toBe(1);
    expect(swipeDecision(-200, false)).toBe('flip');
    expect(swipeDecision(30, false)).toBeNull();
  });

  it('cardFaces: reverse variant shows the back first; languages fall back to the deck', () => {
    const deck = mkDeck({}, { langFront: 'es-ES', langBack: 'en-GB' });
    const card = mkCard(deck.id, { type: 'reversible', front: 'hola', back: 'hello', langBack: 'fr-FR' });
    const rev = cardFaces(card, deck, 'rev');
    expect(rev.front).toEqual({ text: 'hello', lang: 'fr-FR' });
    expect(rev.back.map((p) => p.text)).toEqual(['hello', 'hola']);
    expect(rev.back[1].lang).toBe('es-ES');
    const fwd = cardFaces(card, deck, 'fwd');
    expect(fwd.front.text).toBe('hola');
    expect(fwd.back.map((p) => p.text)).toEqual(['hola', 'hello']);
  });
});
