export type DiffOp = 'eq' | 'ins' | 'del';
export interface DiffPart {
  text: string;
  op: DiffOp;
}
export interface MatchResult {
  verdict: 'exact' | 'close' | 'wrong';
  /** Edit script from the typed answer to the target: `del` is typed text to remove, `ins` is text that was missing. */
  diff: DiffPart[];
}

/** Plain readable text of a Markdown snippet: images keep their alt text, links their label, formatting marks vanish. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[`*~]/g, '')
    .replace(/(^|\W)_+|_+(?=\W|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARTICLE = /^(?:a|an|the)\s+/;

export function normalizeAnswer(s: string): string {
  const text = stripMarkdown(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.replace(ARTICLE, '');
}

/** Levenshtein distance where swapping two adjacent characters ("ie" for "ei") costs one edit. */
function editDistance(a: string[], b: string[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function diffChars(from: string, to: string): DiffPart[] {
  const a = Array.from(from);
  const b = Array.from(to);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (op: DiffOp, char: string) => {
    const last = parts[parts.length - 1];
    if (last?.op === op) last.text += char;
    else parts.push({ text: char, op });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('eq', a[i]);
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      push('del', a[i++]);
    } else {
      push('ins', b[j++]);
    }
  }
  return parts;
}

/** Compares a typed answer with the target; the target may list `/`-separated alternatives. */
export function matchAnswer(input: string, target: string): MatchResult {
  const typed = normalizeAnswer(input);
  const alternatives = [
    ...new Set([normalizeAnswer(target), ...stripMarkdown(target).split('/').map(normalizeAnswer)].filter(Boolean)),
  ];
  if (alternatives.length === 0) return { verdict: 'wrong', diff: typed ? [{ text: typed, op: 'del' }] : [] };
  const typedChars = Array.from(typed);
  let best = alternatives[0];
  let bestDistance = Infinity;
  for (const alt of alternatives) {
    const distance = editDistance(typedChars, Array.from(alt));
    if (distance < bestDistance) {
      best = alt;
      bestDistance = distance;
    }
  }
  const diff = diffChars(typed, best);
  if (!typed) return { verdict: 'wrong', diff };
  if (bestDistance === 0) return { verdict: 'exact', diff };
  const allowed = Math.max(1, Math.floor(Array.from(best).length / 6));
  return { verdict: bestDistance <= allowed ? 'close' : 'wrong', diff };
}
