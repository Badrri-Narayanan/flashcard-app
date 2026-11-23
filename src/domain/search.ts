import type { Card } from './types';

const DEFAULT_LIMIT = 50;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/media:[\w-]+/g, '')
    .replace(/[`*_#>]/g, '');
}

function normalize(text: string): string {
  return fold(stripMarkdown(text));
}

interface Entry {
  card: Card;
  text: string;
  tags: string[];
}

export class SearchIndex {
  private readonly entries: Entry[];

  constructor(cards: Card[]) {
    this.entries = cards
      .filter((c) => c.deletedAt === null)
      .map((card) => ({
        card,
        text: normalize([card.front, card.back, ...card.tags].join(' ')),
        tags: card.tags.map(fold),
      }));
  }

  search(q: string, opts: { tag?: string; limit?: number } = {}): Card[] {
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    const tag = opts.tag === undefined ? null : fold(opts.tag);
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const out: Card[] = [];
    for (const e of this.entries) {
      if (out.length >= limit) break;
      if (tag !== null && !e.tags.includes(tag)) continue;
      if (tokens.every((t) => e.text.includes(t))) out.push(e.card);
    }
    return out;
  }
}
