import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { baseRecord } from '../../domain/ids';
import { onAfterLearnReview } from '../../domain/leech';
import { requeue } from '../../domain/queue';
import { previewIntervals, rate } from '../../domain/scheduler';
import type { Card, Confidence, Deck, Id, Rating, ReviewItem, ReviewLog } from '../../domain/types';
import { useSettings } from '../settings/settings';
import { hasUnseenNew, loadLearnQueue } from './loadLearnQueue';

const STUDY_MORE_NEW = 10;

export interface Current {
  item: ReviewItem;
  card: Card;
  deck: Deck;
  intervals: Record<Rating, string>;
}

interface Answer {
  itemId: Id;
  correct: boolean;
  durationMs: number;
}

interface UndoEntry {
  previous: ReviewItem;
  log: ReviewLog;
  answer: Answer;
  completed: boolean;
}

export interface LearnSession {
  loading: boolean;
  error: boolean;
  current: Current | null;
  revealed: boolean;
  confidence: Confidence | null;
  intervals: Record<Rating, string> | null;
  reveal(): void;
  setConfidence(c: Confidence): void;
  answer(r: Rating): Promise<void>;
  undo(): Promise<void>;
  canUndo: boolean;
  progress: { done: number; remaining: number };
  finished: boolean;
  stats: { studied: number; correct: number; answers: number; timeMs: number };
  nextDueAt: number | null;
  moreNewAvailable: boolean;
  studyMore(): void;
}

const isLive = (r: { deletedAt: number | null } | undefined): boolean => !!r && r.deletedAt === null;

export function useLearnSession(deckIds: Id[]): LearnSession {
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [resolved, setResolved] = useState<Current | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidenceState] = useState<Confidence | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [completed, setCompleted] = useState(0);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const [nextDueAt, setNextDueAt] = useState<number | null>(null);
  const [moreNewAvailable, setMoreNewAvailable] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const extraNew = useRef(0);
  const shownAt = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadLearnQueue(deckKey ? deckKey.split(',') : [], Date.now(), dayStartHour, extraNew.current)
      .then((result) => {
        if (cancelled) return;
        setQueue(result.queue);
        setNextDueAt(result.nextDueAt);
        setUndoEntry(null);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        console.error('Failed to load study session', err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deckKey, dayStartHour, reloadTick]);

  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    let cancelled = false;
    Promise.all([repo.getCard(head.cardId), repo.getDeck(head.deckId)])
      .then(([card, deck]) => {
        if (cancelled) return;
        if (!card || !deck || !isLive(card) || !isLive(deck)) {
          setQueue((q) => q.filter((i) => i.id !== head.id));
          return;
        }
        shownAt.current = Date.now();
        setResolved({ item: head, card, deck, intervals: previewIntervals(head, shownAt.current) });
      })
      .catch((err: unknown) => {
        console.error('Failed to load card', err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [head]);

  const current = resolved && resolved.item === head ? resolved : null;
  const finished = loaded && queue.length === 0;

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    hasUnseenNew(deckKey ? deckKey.split(',') : [])
      .then((more) => {
        if (!cancelled) setMoreNewAvailable(more);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [finished, deckKey, reloadTick]);

  const reveal = useCallback(() => setRevealed(true), []);
  const setConfidence = useCallback((c: Confidence) => {
    setConfidenceState(c);
    setRevealed(true);
  }, []);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current || busy.current) return;
      busy.current = true;
      try {
        const at = Date.now();
        const previous = current.item;
        const next = rate(previous, rating, at);
        const durationMs = Math.max(0, at - shownAt.current);
        const log: ReviewLog = {
          ...baseRecord(),
          reviewItemId: previous.id,
          cardId: previous.cardId,
          deckId: previous.deckId,
          mode: 'learn',
          rating,
          correct: rating >= 2,
          confidence,
          durationMs,
          at,
          dayKey: dayKey(at, dayStartHour),
        };
        await repo.saveReview(next, log);
        const rest = queue.slice(1);
        const nextQueue = requeue(rest, next, at);
        const wasRequeued = nextQueue.length > rest.length;
        const entry: Answer = { itemId: previous.id, correct: log.correct, durationMs };
        setQueue(nextQueue);
        setRevealed(false);
        setConfidenceState(null);
        setAnswers((a) => [...a, entry]);
        setCompleted((c) => c + (wasRequeued ? 0 : 1));
        setUndoEntry({ previous, log, answer: entry, completed: !wasRequeued });
        shownAt.current = Date.now();
        try {
          await onAfterLearnReview(current.card, next, []);
        } catch (err) {
          console.error('Post-review hook failed', err);
        }
      } catch (err) {
        console.error('Failed to save review', err);
        setError(true);
      } finally {
        busy.current = false;
      }
    },
    [current, queue, confidence, dayStartHour],
  );

  const undo = useCallback(async () => {
    if (!undoEntry || busy.current) return;
    busy.current = true;
    try {
      const { previous, log, answer: undone, completed: wasCompleted } = undoEntry;
      await repo.transaction(async () => {
        await repo.saveReview(previous, log);
        await repo.deleteLog(log.id);
      });
      setQueue((q) => [previous, ...q.filter((i) => i.id !== previous.id)]);
      setAnswers((a) => a.slice(0, -1));
      setCompleted((c) => c - (wasCompleted ? 1 : 0));
      setRevealed(false);
      setConfidenceState(null);
      setUndoEntry(null);
      shownAt.current = Date.now() - undone.durationMs;
    } catch (err) {
      console.error('Failed to undo', err);
    } finally {
      busy.current = false;
    }
  }, [undoEntry]);

  const studyMore = useCallback(() => {
    extraNew.current += STUDY_MORE_NEW;
    setLoaded(false);
    setMoreNewAvailable(false);
    setReloadTick((t) => t + 1);
  }, []);

  return {
    loading: !loaded && !error,
    error,
    current,
    revealed,
    confidence,
    intervals: current?.intervals ?? null,
    reveal,
    setConfidence,
    answer,
    undo,
    canUndo: undoEntry !== null,
    progress: { done: completed, remaining: queue.length },
    finished,
    stats: {
      studied: new Set(answers.map((a) => a.itemId)).size,
      correct: answers.filter((a) => a.correct).length,
      answers: answers.length,
      timeMs: answers.reduce((sum, a) => sum + a.durationMs, 0),
    },
    nextDueAt,
    moreNewAvailable,
    studyMore,
  };
}
