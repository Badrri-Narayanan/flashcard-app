import { pickOptions, quizPrompt } from '../../domain/distractors';
import { renderCloze, firstClozeBlank } from '../../domain/cloze';
import { seededRng } from '../../domain/seed';
import type { Card, Deck } from '../../domain/types';

export type PrintLayout = 'cards' | 'worksheet' | 'quiz';
export type PerPage = 8 | 12;

export interface PrintItem {
  id: string;
  front: string;
  back: string;
  frontLang: string;
  backLang: string;
}

export interface QuizItem {
  id: string;
  question: string;
  questionLang: string;
  optionLang: string;
  options: string[];
  correctIndex: number;
}

export function parseLayout(value: string | undefined): PrintLayout {
  return value === 'worksheet' || value === 'quiz' ? value : 'cards';
}

/** Forward side only; a cloze with no blank has nothing to print and is dropped. */
export function toPrintItems(cards: Card[], deck: Deck): PrintItem[] {
  const out: PrintItem[] = [];
  for (const card of cards) {
    if (card.suspended) continue;
    const frontLang = card.langFront ?? deck.settings.langFront;
    const backLang = card.langBack ?? deck.settings.langBack;
    if (card.type === 'cloze') {
      const blank = firstClozeBlank(card.front);
      if (!blank) continue;
      out.push({
        id: card.id,
        front: renderCloze(card.front, blank.n, false),
        back: renderCloze(card.front, blank.n, true),
        frontLang,
        backLang: frontLang,
      });
    } else {
      out.push({ id: card.id, front: card.front, back: card.back, frontLang, backLang });
    }
  }
  return out;
}

/** Reproducible multiple-choice questions (seeded by the deck id); cards that cannot get 2 options are counted as skipped. */
export function buildQuizItems(cards: Card[], deck: Deck): { items: QuizItem[]; skipped: number } {
  const live = cards.filter((c) => !c.suspended);
  const rng = seededRng(deck.id);
  const items: QuizItem[] = [];
  let skipped = 0;
  for (const card of live) {
    const prompt = quizPrompt(card);
    const picked = prompt && pickOptions(card, live, rng);
    if (!prompt || !picked) {
      skipped++;
      continue;
    }
    const frontLang = card.langFront ?? deck.settings.langFront;
    const backLang = card.langBack ?? deck.settings.langBack;
    items.push({
      id: card.id,
      question: prompt.question,
      questionLang: frontLang,
      optionLang: card.type === 'cloze' ? frontLang : backLang,
      ...picked,
    });
  }
  return { items, skipped };
}

export interface CardSheet {
  fronts: Array<PrintItem | null>;
  /** Same cells, each row reversed so a back lines up behind its front when flipped on the long edge. */
  backs: Array<PrintItem | null>;
}

export const COLUMNS: Record<PerPage, number> = { 8: 2, 12: 3 };

export function buildSheets(items: PrintItem[], perPage: PerPage): CardSheet[] {
  const cols = COLUMNS[perPage];
  const sheets: CardSheet[] = [];
  for (let start = 0; start < items.length; start += perPage) {
    const fronts: Array<PrintItem | null> = items.slice(start, start + perPage);
    while (fronts.length % cols !== 0) fronts.push(null);
    const backs: Array<PrintItem | null> = [];
    for (let row = 0; row < fronts.length; row += cols) backs.push(...fronts.slice(row, row + cols).reverse());
    sheets.push({ fronts, backs });
  }
  return sheets;
}
