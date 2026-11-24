import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { dayKey } from '../../src/domain/day';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Confidence, Deck, ReviewLog } from '../../src/domain/types';
import { routes } from '../../src/ui/routes';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from '../../src/ui/settings/settings';
import SessionSummary from '../../src/ui/study/SessionSummary';

afterEach(cleanup);
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
function mkLog(card: Card, over: Partial<ReviewLog> = {}): ReviewLog {
  const at = Date.now();
  return {
    ...baseRecord(), reviewItemId: 'item', cardId: card.id, deckId: card.deckId, mode: 'quiz', rating: null,
    correct: true, confidence: null, durationMs: 1000, at, dayKey: dayKey(at, 4), ...over,
  };
}
async function saveLogs(logs: ReviewLog[]) {
  for (const log of logs) await repo.saveReview(null, log);
}
const sure = (card: Card, correct: boolean) => mkLog(card, { confidence: 'sure' as Confidence, correct });

function withSettings(node: React.ReactNode, patch: Partial<AppSettings> = {}) {
  return <SettingsContext.Provider value={[{ ...DEFAULT_SETTINGS, ...patch }, () => undefined]}>{node}</SettingsContext.Provider>;
}
function renderAt(path: string, patch: Partial<AppSettings> = {}) {
  render(withSettings(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />, patch));
}

describe('StatsPage', () => {
  it('shows streak, heatmap cells with titles, and the empty calibration hint', async () => {
    renderAt('/stats');
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeInTheDocument();
    expect(await screen.findByText('0 day streak')).toBeInTheDocument();
    const heat = screen.getByRole('group', { name: 'Review activity heatmap, one cell per day' });
    expect(heat.querySelectorAll('rect > title')).toHaveLength(365);
    expect(screen.getByText(/Answer a few cards with the confidence prompt on/)).toBeInTheDocument();
  });

  it('shows calibration verdicts, overconfidence warning and card links', async () => {
    const deck = mkDeck();
    const card = mkCard(deck.id, { front: '**Hola** there' });
    await repo.saveDeck(deck);
    await repo.saveCard(card);
    await saveLogs([sure(card, false), sure(card, false), sure(card, false), sure(card, false), sure(card, true)]);
    renderAt('/stats');
    expect(await screen.findByText("When you're Sure, you're right 20% of the time")).toBeInTheDocument();
    expect(screen.getByText(/Expected 95% · Actual 20% \(5 answers\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Overconfident:/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Edit “Hola there”' });
    expect(link).toHaveAttribute('href', `/deck/${deck.id}/edit/${card.id}`);
  });

  it('shows the deck breakdown and an em dash for retention without logs', async () => {
    const deck = mkDeck();
    const card = mkCard(deck.id);
    await repo.saveDeck(deck);
    await repo.saveCard(card);
    renderAt('/stats');
    const region = (await screen.findByRole('region', { name: 'Deck breakdown' }));
    expect(within(region).getByText('Retention (30 days)').nextSibling).toHaveTextContent('—');
    expect(within(region).getByRole('combobox', { name: 'Deck' })).toBeInTheDocument();
  });
});

describe('SessionSummary streak status', () => {
  it('shows the streak and that the goal is met', async () => {
    const deck = mkDeck();
    const card = mkCard(deck.id);
    await repo.saveDeck(deck);
    await saveLogs([mkLog(card), mkLog(card)]);
    render(withSettings(<MemoryRouter><SessionSummary studied={2} accuracy={100} timeMs={1000} backTo="/" /></MemoryRouter>, { dailyGoal: 2 }));
    expect(await screen.findByText('Streak: 1 day')).toBeInTheDocument();
    expect(screen.getByText(/Today's goal is met/)).toBeInTheDocument();
  });

  it('shows how many cards remain to reach the goal', async () => {
    const card = mkCard('d');
    await saveLogs([mkLog(card)]);
    render(withSettings(<MemoryRouter><SessionSummary studied={1} accuracy={100} timeMs={1000} backTo="/" /></MemoryRouter>, { dailyGoal: 3 }));
    expect(await screen.findByText(/2 more cards to reach today's goal/)).toBeInTheDocument();
    expect(screen.getByText('No streak yet')).toBeInTheDocument();
  });
});

describe('GoalRing', () => {
  it('shows progress on the Library header with an accessible label', async () => {
    const card = mkCard('d');
    await saveLogs([mkLog(card), mkLog(card)]);
    renderAt('/', { dailyGoal: 4 });
    expect(await screen.findByRole('img', { name: 'Daily goal: 2 of 4 cards today' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('2/4')).toBeInTheDocument());
  });
});
