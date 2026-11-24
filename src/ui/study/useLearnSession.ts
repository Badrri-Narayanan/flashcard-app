import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { baseRecord } from '../../domain/ids';
import { onAfterLearnReview } from '../../domain/leech';
import { requeue } from '../../domain/queue';
import { previewIntervals, rate } from '../../domain/scheduler';
import type { Card, Confidence, Deck, Id, Rating, ReviewItem, ReviewLog } from '../../domain/types';
import { useStorageErrors } from '../components/storageError';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import { hasUnseenNew, loadLearnQueue } from './loadLearnQueue';
import { recentCardLogs, troubleToast, type StudyToast } from './troubleCheck';

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
  /** Which side faces up right now; the card can be flipped back and forth. */
  revealed: boolean;
  /** The answer has been shown at least once for this card, so it can be rated. */
  answerSeen: boolean;
  /** Changes every time a card is brought up, so the view can replay its entrance. */
  turn: number;
  /** The direction the current card arrived from. */
  enter: 'next' | 'prev' | null;
  /** The current card was skipped earlier in this session. */
  wasSkipped: boolean;
  confidence: Confidence | null;
  intervals: Record<Rating, string> | null;
  reveal(): void;
  flip(): void;
  /** Leave the card unrated and bring the next one; the skipped card returns at the end of the queue. */
  skip(): void;
  /** Go back: returns the last skipped card, or undoes the last rating so that card shows again. */
  previous(): Promise<void>;
  canPrevious: boolean;
  setConfidence(c: Confidence): void;
  answer(r: Rating): Promise<void>;
  undo(): Promise<void>;
  canUndo: boolean;
  progress: { done: number; remaining: number };
  finished: boolean;
  stats: { studied: number; correct: number; answers: number; timeMs: number };
  nextDueAt: number | null;
  limitReached: boolean;
  moreNewAvailable: boolean;
  studyMore(): void;
  notice: LearnNotice | null;
  clearNotice(): void;
}

export type LearnNotice = StudyToast;

type Step = { kind: 'skip'; itemId: Id } | { kind: 'rate' };

const isLive = (r: { deletedAt: number | null } | undefined): boolean => !!r && r.deletedAt === null;


export function useLearnSession(deckIds: Id[]): LearnSession {
  const { reportStorageError } = useStorageErrors();
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [resolved, setResolved] = useState<Current | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerSeen, setAnswerSeen] = useState(false);
  const [turn, setTurn] = useState(0);
  const [enter, setEnter] = useState<'next' | 'prev' | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<Id>>(() => new Set());
  const [history, setHistory] = useState<Step[]>([]);
  const [confidence, setConfidenceState] = useState<Confidence | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [completed, setCompleted] = useState(0);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const [nextDueAt, setNextDueAt] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [notice, setNotice] = useState<LearnNotice | null>(null);
  const [moreNewAvailable, setMoreNewAvailable] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const extraNew = useRef(0);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const answeredItem = useRef<ReviewItem | null>(null);
  const undoneLog = useRef<Id | null>(null);
  const noticeId = useRef(0);
  const showNotice = useCallback(
    (message: string, action?: LearnNotice['action']) => setNotice({ id: ++noticeId.current, message, action }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadLearnQueue(deckKey ? deckKey.split(',') : [], Date.now(), dayStartHour, extraNew.current)
      .then((result) => {
        if (cancelled) return;
        setQueue(result.queue);
        setNextDueAt(result.nextDueAt);
        setLimitReached(result.limitReached);
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

  const reveal = useCallback(() => {
    setRevealed(true);
    setAnswerSeen(true);
  }, []);
  const flip = useCallback(() => {
    setRevealed((r) => !r);
    setAnswerSeen(true);
  }, []);
  const setConfidence = useCallback((c: Confidence) => {
    setConfidenceState(c);
    setRevealed(true);
    setAnswerSeen(true);
  }, []);

  /** Fresh face-down state for whichever card comes up next. */
  const bringUp = useCallback((direction: 'next' | 'prev') => {
    setRevealed(false);
    setAnswerSeen(false);
    setConfidenceState(null);
    setEnter(direction);
    setTurn((t) => t + 1);
    shownAt.current = Date.now();
  }, []);

  const skip = useCallback(() => {
    if (!current || busy.current) return;
    const id = current.item.id;
    setQueue((q) => (q[0]?.id === id ? [...q.slice(1), q[0]] : q));
    setSkipped((prev) => new Set(prev).add(id));
    setHistory((h) => [...h, { kind: 'skip', itemId: id }]);
    bringUp('next');
  }, [current, bringUp]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current || busy.current || answeredItem.current === current.item) return;
      busy.current = true;
      try {
        const previous = current.item;
        const [liveCard, liveItems] = await Promise.all([
          repo.getCard(previous.cardId),
          repo.getReviewItemsForCard(previous.cardId),
        ]);
        if (!isLive(liveCard) || !liveItems.some((i) => i.id === previous.id)) {
          setQueue((q) => q.filter((i) => i.id !== previous.id));
          bringUp('next');
          return;
        }
        answeredItem.current = previous;
        const at = Date.now();
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
        bringUp('next');
        setSkipped((prev) => {
          if (!prev.has(previous.id)) return prev;
          const rest = new Set(prev);
          rest.delete(previous.id);
          return rest;
        });
        setHistory((h) => [...h, { kind: 'rate' }]);
        setAnswers((a) => [...a, entry]);
        setCompleted((c) => c + (wasRequeued ? 0 : 1));
        setUndoEntry({ previous, log, answer: entry, completed: !wasRequeued });
        try {
          const card = liveCard as Card;
          const logs = card.trouble ? [] : await recentCardLogs(card);
          if (await onAfterLearnReview(card, next, logs, { saveCard: (c) => repo.saveCard(c) })) {
            const toast = troubleToast(card.deckId);
            showNotice(toast.message, toast.action);
          }
        } catch (err) {
          console.error('Post-review hook failed', err);
        }
      } catch (err) {
        console.error('Failed to save review', err);
        reportStorageError(err);
        answeredItem.current = null;
        showNotice(strings.study.saveFailed);
      } finally {
        busy.current = false;
      }
    },
    [current, queue, confidence, dayStartHour, showNotice, reportStorageError, bringUp],
  );

  const undoRating = useCallback(async (): Promise<boolean> => {
    if (!undoEntry || busy.current || undoneLog.current === undoEntry.log.id) return false;
    busy.current = true;
    try {
      const { previous, log, completed: wasCompleted } = undoEntry;
      undoneLog.current = log.id;
      const stillLive = (await repo.getReviewItemsForCard(previous.cardId)).some((i) => i.id === previous.id);
      await repo.transaction(async () => {
        if (stillLive) await repo.saveReview(previous, log);
        await repo.deleteLog(log.id);
      });
      answeredItem.current = null;
      if (stillLive) setQueue((q) => [previous, ...q.filter((i) => i.id !== previous.id)]);
      setAnswers((a) => a.slice(0, -1));
      setCompleted((c) => c - (wasCompleted ? 1 : 0));
      setHistory((h) => {
        const at = h.map((step) => step.kind).lastIndexOf('rate');
        return at < 0 ? h : [...h.slice(0, at), ...h.slice(at + 1)];
      });
      bringUp('prev');
      setUndoEntry(null);
      return true;
    } catch (err) {
      console.error('Failed to undo', err);
      undoneLog.current = null;
      showNotice(strings.study.undoFailed);
      return false;
    } finally {
      busy.current = false;
    }
  }, [undoEntry, showNotice, bringUp]);

  const undo = useCallback(async () => {
    await undoRating();
  }, [undoRating]);

  const lastStep = history[history.length - 1];
  const canPrevious = lastStep?.kind === 'skip' || (lastStep?.kind === 'rate' && undoEntry !== null);

  const previous = useCallback(async () => {
    if (busy.current || !lastStep) return;
    if (lastStep.kind === 'skip') {
      const { itemId } = lastStep;
      setHistory((h) => h.slice(0, -1));
      setQueue((q) => {
        const item = q.find((i) => i.id === itemId);
        return item ? [item, ...q.filter((i) => i.id !== itemId)] : q;
      });
      bringUp('prev');
      return;
    }
    if (undoEntry && (await undoRating())) showNotice(strings.study.ratingUndone);
  }, [lastStep, undoEntry, undoRating, bringUp, showNotice]);

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
    answerSeen,
    turn,
    enter,
    wasSkipped: current ? skipped.has(current.item.id) : false,
    confidence,
    intervals: current?.intervals ?? null,
    reveal,
    flip,
    skip,
    previous,
    canPrevious,
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
    limitReached,
    moreNewAvailable,
    studyMore,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
  };
}
