export type TermSep = ' - ' | '\t' | ':' | ',' | ';' | { custom: string };
export type CardSep = 'newline' | 'blankline';

export interface Draft {
  front: string;
  back: string;
}

const CANDIDATES: readonly TermSep[] = ['\t', ' - ', ':', ';', ','];
const BLANK_LINE = /\n\s*\n/;

function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function sepString(sep: TermSep): string {
  return typeof sep === 'string' ? sep : sep.custom;
}

/** Splits on the first occurrence of the separator; null when absent. */
function splitFirst(line: string, sep: string): [string, string] | null {
  if (!sep) return null;
  const at = line.indexOf(sep);
  return at < 0 ? null : [line.slice(0, at), line.slice(at + sep.length)];
}

export function detectSeparators(text: string): { term: TermSep; card: CardSep } {
  const norm = normalize(text);
  const lines = norm.split('\n').filter((l) => l.trim() !== '');
  let term: TermSep = ' - ';
  let best = 0;
  for (const cand of CANDIDATES) {
    const count = lines.filter((l) => l.includes(cand as string)).length;
    if (count > best) {
      best = count;
      term = cand;
    }
  }
  const multiLineBlock = BLANK_LINE.test(norm) && groupBlocks(norm).some((b) => b.lines.length > 1);
  return { term, card: multiLineBlock ? 'blankline' : 'newline' };
}

interface Block {
  /** 1-based line number of the block's first line. */
  line: number;
  lines: string[];
}

function groupBlocks(norm: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  norm.split('\n').forEach((raw, i) => {
    if (raw.trim() === '') {
      current = null;
      return;
    }
    if (!current) {
      current = { line: i + 1, lines: [] };
      blocks.push(current);
    }
    current.lines.push(raw);
  });
  return blocks;
}

export function parseBulk(text: string, opts: { term: TermSep; card: CardSep }): { drafts: Draft[]; skipped: number[] } {
  const norm = normalize(text);
  const sep = sepString(opts.term);
  const blocks: Block[] =
    opts.card === 'blankline'
      ? groupBlocks(norm)
      : norm.split('\n').flatMap((l, i) => (l.trim() === '' ? [] : [{ line: i + 1, lines: [l] }]));

  const drafts: Draft[] = [];
  const skipped: number[] = [];
  for (const block of blocks) {
    const [first, ...rest] = block.lines;
    const split = splitFirst(first, sep);
    let front: string;
    let back: string;
    if (split) {
      front = split[0].trim();
      back = [split[1], ...rest].join('\n').trim();
    } else if (opts.card === 'blankline') {
      front = first.trim();
      back = rest.join('\n').trim();
    } else {
      front = first.trim();
      back = '';
    }
    if (front && back) drafts.push({ front, back });
    else skipped.push(block.line);
  }
  return { drafts, skipped };
}
