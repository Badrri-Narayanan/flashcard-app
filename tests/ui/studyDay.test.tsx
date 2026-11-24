import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { baseRecord } from '../../src/domain/ids';
import { newReviewItem } from '../../src/domain/scheduler';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, ReviewLog } from '../../src/domain/types';
import { useDailyProgress } from '../../src/ui/hooks/useDailyProgress';
import { useLibrary } from '../../src/ui/hooks/useLibrary';
import { useStudyDayNow } from '../../src/ui/hooks/useStudyDayNow';
import { DEFAULT_SETTINGS, SettingsContext } from '../../src/ui/settings/settings';

const HOUR = 3_600_000;
// 03:00 local on 10 March; with the day starting at 04:00 this is still the study day of 9 March.
const BEFORE_BOUNDARY = new Date(2026, 2, 10, 3, 0).getTime();
const NEXT_MORNING = new Date(2026, 2, 10, 9, 0).getTime();

const wrapper = ({ children }: { children: ReactNode }) => (
  <SettingsContext.Provider value={[{ ...DEFAULT_SETTINGS, dayStartHour: 4, dailyGoal: 1 }, () => undefined]}>{children}</SettingsContext.Provider>
);

function resume(at: number) {
  vi.setSystemTime(at);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BEFORE_BOUNDARY);
  await db.delete();
  await db.open();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useStudyDayNow', () => {
  it('ticks at the study-day boundary', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(BEFORE_BOUNDARY);
    const { result } = renderHook(() => useStudyDayNow(4));
    expect(result.current).toBe('2026-03-09');
    act(() => {
      vi.advanceTimersByTime(HOUR + 1000);
    });
    expect(result.current).toBe('2026-03-10');
  });

  it('refreshes when the app becomes visible or focused on a new day', () => {
    const { result } = renderHook(() => useStudyDayNow(4));
    expect(result.current).toBe('2026-03-09');
    resume(NEXT_MORNING);
    expect(result.current).toBe('2026-03-10');
    vi.setSystemTime(NEXT_MORNING + 24 * HOUR);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-03-11');
  });
});

describe('day rollover in live queries', () => {
  it('the goal ring starts from zero on a new study day without any database write', async () => {
    const log: ReviewLog = {
      ...baseRecord(), reviewItemId: 'i', cardId: 'c', deckId: 'd', mode: 'quiz', rating: null, correct: true,
      confidence: null, durationMs: 1, at: BEFORE_BOUNDARY - HOUR, dayKey: '2026-03-09',
    };
    await db.reviewLogs.put(log);
    const { result } = renderHook(() => useDailyProgress(false), { wrapper });
    await waitFor(() => expect(result.current?.today).toBe(1));
    resume(NEXT_MORNING);
    await waitFor(() => expect(result.current?.today).toBe(0));
  });

  it('due counts include items that came due on the new study day', async () => {
    const deck: Deck = {
      ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '', order: 0,
      settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
    };
    const card: Card = {
      ...baseRecord(), deckId: deck.id, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
      tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
    };
    await db.decks.put(deck);
    await db.cards.put(card);
    await db.reviewItems.put({ ...newReviewItem(card.id, deck.id, 'fwd'), state: 2, reps: 3, due: NEXT_MORNING });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.dueCounts[deck.id].due).toBe(0);
    resume(NEXT_MORNING);
    await waitFor(() => expect(result.current.dueCounts[deck.id].due).toBe(1));
  });
});
