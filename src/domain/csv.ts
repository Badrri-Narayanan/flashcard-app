import Papa from 'papaparse';
import type { Card } from './types';

export type CsvField = 'front' | 'back' | 'tags' | 'type' | 'mnemonic' | 'distractors' | 'ignore';
type Delimiter = ',' | ';' | '\t';

const HEADER_WORDS = ['front', 'back', 'term', 'definition', 'question', 'answer'];
const HEADER_FIELD: Record<string, CsvField> = {
  front: 'front', term: 'front', question: 'front',
  back: 'back', definition: 'back', answer: 'back',
  tags: 'tags', tag: 'tags', type: 'type', mnemonic: 'mnemonic', distractors: 'distractors',
};
const CARD_TYPES: Card['type'][] = ['basic', 'reversible', 'cloze', 'mcq'];
const CSV_COLUMNS = ['front', 'back', 'tags', 'type', 'mnemonic', 'distractors'];

export function parseCsv(text: string): { headers: string[] | null; rows: string[][]; delimiter: Delimiter } {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<string[]>(clean, { delimitersToGuess: [',', ';', '\t'], skipEmptyLines: true });
  const all = result.data;
  const delimiter = ([',', ';', '\t'] as string[]).includes(result.meta.delimiter) ? (result.meta.delimiter as Delimiter) : ',';
  const first = all[0];
  const hasHeader = !!first && first.some((c) => HEADER_WORDS.includes(c.trim().toLowerCase()));
  return hasHeader ? { headers: first, rows: all.slice(1), delimiter } : { headers: null, rows: all, delimiter };
}

export function guessMapping(headers: string[] | null, columnCount: number): CsvField[] {
  const mapping: CsvField[] = Array.from({ length: columnCount }, () => 'ignore');
  if (!headers) {
    if (columnCount > 0) mapping[0] = 'front';
    if (columnCount > 1) mapping[1] = 'back';
    return mapping;
  }
  const used = new Set<CsvField>();
  for (let i = 0; i < columnCount; i++) {
    const field = HEADER_FIELD[(headers[i] ?? '').trim().toLowerCase()];
    if (field && !used.has(field)) {
      mapping[i] = field;
      used.add(field);
    }
  }
  if (!used.has('front') && mapping[0] === 'ignore') mapping[0] = 'front';
  if (!used.has('back') && columnCount > 1 && mapping[1] === 'ignore') mapping[1] = 'back';
  return mapping;
}

export function rowsToDrafts(rows: string[][], mapping: CsvField[]): Partial<Card>[] {
  return rows.map((row) => {
    const draft: Partial<Card> = { front: '', back: '', type: 'basic', tags: [], distractors: [], mnemonic: '' };
    mapping.forEach((field, i) => {
      const value = (row[i] ?? '').trim();
      switch (field) {
        case 'front': draft.front = value; break;
        case 'back': draft.back = value; break;
        case 'mnemonic': draft.mnemonic = value; break;
        case 'tags': draft.tags = value.split(/[;\s]+/).filter(Boolean); break;
        case 'distractors': draft.distractors = value.split('|').map((s) => s.trim()).filter(Boolean); break;
        case 'type': {
          const t = value.toLowerCase() as Card['type'];
          draft.type = CARD_TYPES.includes(t) ? t : 'basic';
          break;
        }
        default: break;
      }
    });
    return draft;
  });
}

/** A draft is importable when it has a front, and a back unless it is a cloze card. */
export function isImportable(d: Partial<Card>): boolean {
  return !!d.front && (d.type === 'cloze' || !!d.back);
}

export function cardsToCsv(cards: Card[]): string {
  const rows = cards.map((c) => [c.front, c.back, c.tags.join(' '), c.type, c.mnemonic, c.distractors.join('|')]);
  return Papa.unparse([CSV_COLUMNS, ...rows], { newline: '\n' });
}
