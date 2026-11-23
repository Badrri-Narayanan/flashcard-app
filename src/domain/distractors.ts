import { firstClozeBlank, renderCloze } from './cloze';
import type { Card } from './types';

const MAX_OPTIONS = 4;
const MIN_QUIZ_CARDS = 4;
export const MIN_MATCH_CARDS = 3;
const LENGTH_TOLERANCE = 0.5;

export interface QuizPrompt {
  /** Markdown shown as the question. */
  question: string;
  /** Markdown of the correct answer. */
  answer: string;
}

/** What a quiz asks for a card: forward only; cloze hides its first blank. Null for a cloze with no blank. */
export function quizPrompt(card: Card): QuizPrompt | null {
  if (card.type !== 'cloze') return { question: card.front, answer: card.back };
  const blank = firstClozeBlank(card.front);
  return blank ? { question: renderCloze(card.front, blank.n, false), answer: blank.answer } : null;
}

export function canQuiz(cards: Card[]): boolean {
  return cards.filter((c) => !c.suspended).length >= MIN_QUIZ_CARDS;
}

export function canMatch(cards: Card[]): boolean {
  return cards.filter((c) => !c.suspended).length >= MIN_MATCH_CARDS;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Fisher-Yates shuffle of a copy, driven by the given random source. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Candidate {
  text: string;
  /** 0 = same kind as the question's answer, 1 = fallback kind. */
  kindRank: number;
  sameTag: boolean;
  similarLength: boolean;
}

function poolCandidates(card: Card, pool: Card[], correct: string): Candidate[] {
  const wantCloze = card.type === 'cloze';
  const tags = new Set(card.tags);
  const out: Candidate[] = [];
  for (const other of pool) {
    if (other.id === card.id || other.suspended) continue;
    const isCloze = other.type === 'cloze';
    const text = isCloze ? firstClozeBlank(other.front)?.answer : other.back;
    if (!text?.trim()) continue;
    out.push({
      text,
      kindRank: isCloze === wantCloze ? 0 : 1,
      sameTag: other.tags.some((t) => tags.has(t)),
      similarLength: Math.abs(text.length - correct.length) <= correct.length * LENGTH_TOLERANCE,
    });
  }
  return out;
}

/**
 * Builds shuffled multiple-choice options for a card. Authored mcq distractors come first, then the pool tops up,
 * preferring the same kind of answer, shared tags and similar length. Null when fewer than 2 distinct options exist.
 */
export function pickOptions(
  card: Card,
  pool: Card[],
  rng: () => number,
  count = MAX_OPTIONS,
): { options: string[]; correctIndex: number } | null {
  const prompt = quizPrompt(card);
  if (!prompt || !prompt.answer.trim()) return null;
  const correct = prompt.answer;
  const seen = new Set([normalize(correct)]);
  const distractors: string[] = [];
  const take = (text: string) => {
    const key = normalize(text);
    if (distractors.length >= count - 1 || !key || seen.has(key)) return;
    seen.add(key);
    distractors.push(text);
  };

  if (card.type === 'mcq') for (const d of shuffled(card.distractors, rng)) take(d);

  const ranked = shuffled(poolCandidates(card, pool, correct), rng).sort(
    (a, b) =>
      a.kindRank - b.kindRank || Number(b.sameTag) - Number(a.sameTag) || Number(b.similarLength) - Number(a.similarLength),
  );
  for (const c of ranked) take(c.text);

  if (distractors.length < 1) return null;
  const options = shuffled([correct, ...distractors], rng);
  return { options, correctIndex: options.indexOf(correct) };
}
