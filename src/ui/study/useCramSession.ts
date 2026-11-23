import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { baseRecord } from '../../domain/ids';
import { strings } from '../strings';
import type { Card, Deck, Id, ReviewLog } from '../../domain/types';
import { useSettings } from '../settings/settings';

export interface CramEntry {
  card: Card;
  deck: Deck;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface CramSession {
  loading: boolean;
  entries: CramEntry[];
  index: number;
  current: CramEntry | null;
  revealed: boolean;
  flip(): void;
  next(): void;
  prev(): void;
  mark(correct: boolean): Promise<void>;
  finished: boolean;
  notice: { id: number; message: string } | null;
  clearNotice(): void;
  stats: { studied: number; correct: number; timeMs: number };
}

/** Cram: shuffled, non-suspended cards; writes cram ReviewLogs only and never touches scheduling. */
export function useCramSession(deckIds: Id[]): CramSession {
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [entries, setEntries] = useState<CramEntry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [marks, setMarks] = useState<{ correct: boolean; ms: number }[]>([]);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const noticeId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = deckKey ? deckKey.split(',') : [];
      const decks = (await Promise.all(ids.map((id) => repo.getDeck(id)))).filter(
        (d): d is Deck => !!d && d.deletedAt === null,
      );
      const lists = await Promise.all(decks.map((d) => repo.listCards(d.id)));
      const loaded = decks.flatMap((deck, i) => lists[i].filter((c) => !c.suspended).map((card) => ({ card, deck })));
      if (cancelled) return;
      shownAt.current = Date.now();
      setEntries(shuffle(loaded));
    })().catch((err: unknown) => {
      console.error('Failed to load cram session', err);
      if (!cancelled) setEntries([]);
    });
    return () => {
      cancelled = true;
    };
  }, [deckKey]);

  const list = useMemo(() => entries ?? [], [entries]);
  const go = useCallback((to: number) => {
    setIndex(to);
    setRevealed(false);
    shownAt.current = Date.now();
  }, []);

  const mark = useCallback(
    async (correct: boolean) => {
      const entry = list[index];
      if (!entry || busy.current) return;
      busy.current = true;
      try {
        const at = Date.now();
        const durationMs = Math.max(0, at - shownAt.current);
        const [item] = await repo.getReviewItemsForCard(entry.card.id);
        if (item) {
          const log: ReviewLog = {
            ...baseRecord(),
            reviewItemId: item.id,
            cardId: entry.card.id,
            deckId: entry.card.deckId,
            mode: 'cram',
            rating: null,
            correct,
            confidence: null,
            durationMs,
            at,
            dayKey: dayKey(at, dayStartHour),
          };
          await repo.saveReview(null, log);
        }
        setMarks((m) => [...m, { correct, ms: durationMs }]);
        if (index + 1 >= list.length) setFinished(true);
        else go(index + 1);
      } catch (err) {
        console.error('Failed to save cram result', err);
        setNotice({ id: ++noticeId.current, message: strings.study.saveFailed });
      } finally {
        busy.current = false;
      }
    },
    [list, index, dayStartHour, go],
  );

  return {
    loading: entries === null,
    entries: list,
    index,
    current: list[index] ?? null,
    revealed,
    flip: useCallback(() => setRevealed((r) => !r), []),
    next: useCallback(() => {
      if (index + 1 < list.length) go(index + 1);
    }, [index, list.length, go]),
    prev: useCallback(() => {
      if (index > 0) go(index - 1);
    }, [index, go]),
    mark,
    notice,
    clearNotice: () => setNotice(null),
    finished,
    stats: {
      studied: marks.length,
      correct: marks.filter((m) => m.correct).length,
      timeMs: marks.reduce((sum, m) => sum + m.ms, 0),
    },
  };
}
