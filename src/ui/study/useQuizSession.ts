import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { canQuiz, pickOptions, quizPrompt, shuffled } from '../../domain/distractors';
import { baseRecord } from '../../domain/ids';
import { mulberry32 } from '../../domain/queue';
import type { Card, Deck, Id, ReviewLog } from '../../domain/types';
import { useLoadRetry } from '../hooks/useLoadRetry';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import { loadScopeCards } from './loadScopeCards';
import { checkPracticeTrouble, troubleToast, type StudyToast } from './troubleCheck';

export const QUIZ_LENGTH = 10;

export interface QuizQuestion {
  card: Card;
  question: string;
  questionLang: string;
  optionLang: string;
  options: string[];
  correctIndex: number;
}

export interface QuizResult {
  question: QuizQuestion;
  picked: number;
  correct: boolean;
  ms: number;
}

export interface QuizSession {
  loading: boolean;
  /** True when the cards could not be read; `retry` loads again. */
  loadFailed: boolean;
  retry(): void;
  /** False when the scope has too few non-suspended cards to build a quiz. */
  available: boolean;
  questions: QuizQuestion[];
  index: number;
  current: QuizQuestion | null;
  /** Index of the chosen option once answered, else null. */
  picked: number | null;
  answer(optionIndex: number): Promise<void>;
  next(): void;
  finished: boolean;
  results: QuizResult[];
  notice: StudyToast | null;
  clearNotice(): void;
}

function buildQuestions(cards: Card[], decks: Map<Id, Deck>, rng: () => number): QuizQuestion[] {
  const order = shuffled(cards, rng);
  const out: QuizQuestion[] = [];
  for (const card of order) {
    if (out.length >= QUIZ_LENGTH) break;
    const prompt = quizPrompt(card);
    const picked = pickOptions(card, cards, rng);
    const deck = decks.get(card.deckId);
    if (!prompt || !picked || !deck) continue;
    const langFront = card.langFront ?? deck.settings.langFront;
    const langBack = card.langBack ?? deck.settings.langBack;
    out.push({
      card,
      question: prompt.question,
      questionLang: langFront,
      optionLang: card.type === 'cloze' ? langFront : langBack,
      ...picked,
    });
  }
  return out;
}

/** Quiz: multiple choice over non-suspended cards; writes quiz ReviewLogs only and never touches scheduling. */
export function useQuizSession(deckIds: Id[]): QuizSession {
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [loaded, setLoaded] = useState<{ available: boolean; questions: QuizQuestion[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const [notice, setNotice] = useState<StudyToast | null>(null);
  const noticeId = useRef(0);
  const load = useLoadRetry();
  const { attempt, fail } = load;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { decks, cards } = await loadScopeCards(deckKey);
      if (cancelled) return;
      shownAt.current = Date.now();
      const available = canQuiz(cards);
      const questions = available ? buildQuestions(cards, decks, mulberry32(Date.now())) : [];
      setLoaded({ available, questions });
    })().catch((err: unknown) => {
      console.error('Failed to load quiz session', err);
      if (!cancelled) fail(err);
    });
    return () => {
      cancelled = true;
    };
  }, [deckKey, attempt, fail]);

  const questions = loaded?.questions ?? [];
  const current = questions[index] ?? null;

  const answer = useCallback(
    async (optionIndex: number) => {
      if (!current || picked !== null || busy.current) return;
      if (optionIndex < 0 || optionIndex >= current.options.length) return;
      busy.current = true;
      try {
        const at = Date.now();
        const durationMs = Math.max(0, at - shownAt.current);
        const correct = optionIndex === current.correctIndex;
        const [item] = await repo.getReviewItemsForCard(current.card.id);
        if (item) {
          const log: ReviewLog = {
            ...baseRecord(),
            reviewItemId: item.id,
            cardId: current.card.id,
            deckId: current.card.deckId,
            mode: 'quiz',
            rating: null,
            correct,
            confidence: null,
            durationMs,
            at,
            dayKey: dayKey(at, dayStartHour),
          };
          await repo.saveReview(null, log);
        }
        setResults((r) => [...r, { question: current, picked: optionIndex, correct, ms: durationMs }]);
        setPicked(optionIndex);
        if (item) {
          const flaggedDeck = await checkPracticeTrouble(current.card.id);
          if (flaggedDeck) setNotice({ id: ++noticeId.current, ...troubleToast(flaggedDeck) });
        }
      } catch (err) {
        console.error('Failed to save quiz result', err);
        setNotice({ id: ++noticeId.current, message: strings.study.saveFailed });
      } finally {
        busy.current = false;
      }
    },
    [current, picked, dayStartHour],
  );

  const next = useCallback(() => {
    if (picked === null) return;
    if (index + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
    shownAt.current = Date.now();
  }, [picked, index, questions.length]);

  return {
    loading: loaded === null,
    loadFailed: load.failed,
    retry: load.retry,
    available: loaded?.available ?? true,
    questions,
    index,
    current,
    picked,
    answer,
    next,
    finished,
    results,
    notice,
    clearNotice: () => setNotice(null),
  };
}
