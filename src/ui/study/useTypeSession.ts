import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { quizPrompt, shuffled } from '../../domain/distractors';
import { baseRecord } from '../../domain/ids';
import { matchAnswer, type MatchResult } from '../../domain/matcher';
import { mulberry32 } from '../../domain/queue';
import type { Card, ReviewLog } from '../../domain/types';
import { useLoadRetry } from '../hooks/useLoadRetry';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import { loadScopeCards } from './loadScopeCards';
import { checkPracticeTrouble, troubleToast, type StudyToast } from './troubleCheck';

export const TYPE_LENGTH = 20;

export interface TypeItem {
  card: Card;
  question: string;
  answer: string;
  questionLang: string;
  answerLang: string;
}

export interface TypeResult {
  item: TypeItem;
  input: string;
  match: MatchResult;
  /** Exact and close count as correct; "I was right" also flips a wrong answer. */
  correct: boolean;
  overridden: boolean;
  ms: number;
  log: ReviewLog | null;
}

export interface TypeSession {
  loading: boolean;
  /** True when the cards could not be read; `retry` loads again. */
  loadFailed: boolean;
  retry(): void;
  items: TypeItem[];
  index: number;
  current: TypeItem | null;
  /** The result for the current card once checked, else null. */
  checked: TypeResult | null;
  check(input: string): Promise<void>;
  override(): Promise<void>;
  next(): void;
  finished: boolean;
  results: TypeResult[];
  notice: StudyToast | null;
  clearNotice(): void;
}

/** Type: write the answer from memory; writes type ReviewLogs only and never touches scheduling. */
export function useTypeSession(deckIds: string[]): TypeSession {
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [items, setItems] = useState<TypeItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<TypeResult[]>([]);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const [notice, setNotice] = useState<StudyToast | null>(null);
  const noticeId = useRef(0);
  const load = useLoadRetry();
  const { attempt, fail: failLoad } = load;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { decks, cards } = await loadScopeCards(deckKey);
      const built: TypeItem[] = [];
      for (const card of shuffled(cards, mulberry32(Date.now()))) {
        if (built.length >= TYPE_LENGTH) break;
        const prompt = quizPrompt(card);
        const deck = decks.get(card.deckId);
        if (!prompt || !prompt.answer.trim() || !deck) continue;
        const langFront = card.langFront ?? deck.settings.langFront;
        const langBack = card.langBack ?? deck.settings.langBack;
        built.push({
          card,
          question: prompt.question,
          answer: prompt.answer,
          questionLang: langFront,
          answerLang: card.type === 'cloze' ? langFront : langBack,
        });
      }
      if (cancelled) return;
      shownAt.current = Date.now();
      setItems(built);
    })().catch((err: unknown) => {
      console.error('Failed to load type session', err);
      if (!cancelled) failLoad(err);
    });
    return () => {
      cancelled = true;
    };
  }, [deckKey, attempt, failLoad]);

  const list = items ?? [];
  const current = list[index] ?? null;
  const checked = results[index] ?? null;

  const fail = useCallback((message: string, err: unknown) => {
    console.error(message, err);
    setNotice({ id: ++noticeId.current, message: strings.study.saveFailed });
  }, []);

  const makeLog = useCallback(
    async (item: TypeItem, correct: boolean, durationMs: number, at: number): Promise<ReviewLog | null> => {
      const [reviewItem] = await repo.getReviewItemsForCard(item.card.id);
      if (!reviewItem) return null;
      return {
        ...baseRecord(),
        reviewItemId: reviewItem.id,
        cardId: item.card.id,
        deckId: item.card.deckId,
        mode: 'type',
        rating: null,
        correct,
        confidence: null,
        durationMs,
        at,
        dayKey: dayKey(at, dayStartHour),
      };
    },
    [dayStartHour],
  );

  const check = useCallback(
    async (input: string) => {
      if (!current || checked || busy.current) return;
      busy.current = true;
      try {
        const at = Date.now();
        const ms = Math.max(0, at - shownAt.current);
        const match = matchAnswer(input, current.answer);
        const correct = match.verdict !== 'wrong';
        const log = await makeLog(current, correct, ms, at);
        if (log) await repo.saveReview(null, log);
        setResults((r) => [...r, { item: current, input, match, correct, overridden: false, ms, log }]);
        if (log) {
          const flaggedDeck = await checkPracticeTrouble(current.card.id);
          if (flaggedDeck) setNotice({ id: ++noticeId.current, ...troubleToast(flaggedDeck) });
        }
      } catch (err) {
        fail('Failed to save type result', err);
      } finally {
        busy.current = false;
      }
    },
    [current, checked, makeLog, fail],
  );

  const override = useCallback(async () => {
    if (!checked || checked.correct || busy.current) return;
    busy.current = true;
    try {
      const log = checked.log ? { ...checked.log, correct: true, updatedAt: Date.now() } : null;
      if (log) await repo.saveReview(null, log);
      setResults((r) => r.map((x, i) => (i === index ? { ...x, correct: true, overridden: true, log } : x)));
    } catch (err) {
      fail('Failed to save corrected type result', err);
    } finally {
      busy.current = false;
    }
  }, [checked, index, fail]);

  const next = useCallback(() => {
    if (!checked) return;
    if (index + 1 >= list.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    shownAt.current = Date.now();
  }, [checked, index, list.length]);

  return {
    loading: items === null,
    loadFailed: load.failed,
    retry: load.retry,
    items: list,
    index,
    current,
    checked,
    check,
    override,
    next,
    finished,
    results,
    notice,
    clearNotice: () => setNotice(null),
  };
}
