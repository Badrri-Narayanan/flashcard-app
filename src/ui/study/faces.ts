import { parseClozeNumbers, renderCloze } from '../../domain/cloze';
import type { Card, Deck, Variant } from '../../domain/types';

export interface Part {
  text: string;
  lang: string;
}

export interface Faces {
  front: Part;
  /** Everything shown once revealed, top to bottom. */
  back: Part[];
}

/** What a Learn/Cram card shows before and after reveal, per card type and variant. */
export function cardFaces(card: Card, deck: Deck, variant: Variant): Faces {
  const langFront = card.langFront ?? deck.settings.langFront;
  const langBack = card.langBack ?? deck.settings.langBack;
  const front = (text: string): Part => ({ text, lang: langFront });
  const back = (text: string): Part => ({ text, lang: langBack });

  if (card.type === 'cloze' && variant.startsWith('c')) {
    const n = Number(variant.slice(1));
    const revealed = [front(renderCloze(card.front, n, true))];
    if (card.back.trim()) revealed.push(back(card.back));
    return { front: front(renderCloze(card.front, n, false)), back: revealed };
  }
  if (variant === 'rev') return { front: back(card.back), back: [back(card.back), front(card.front)] };
  return { front: front(card.front), back: [front(card.front), back(card.back)] };
}

/** Cram has no scheduling, so each card is shown once: its first cloze blank, or the forward side. */
export function cramVariant(card: Card): Variant {
  return card.type === 'cloze' ? `c${parseClozeNumbers(card.front)[0] ?? 1}` : 'fwd';
}
