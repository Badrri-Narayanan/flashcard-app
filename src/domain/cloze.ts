interface Blank {
  start: number;
  end: number;
  n: number;
  answer: string;
  hint: string | null;
}

const BLANK_RE = /\{\{(.*?)\}\}/gs;
const EXPLICIT_RE = /^c([1-9]\d*)::(.*)$/s;

function parseBlanks(text: string): Blank[] {
  const raw: Array<Omit<Blank, 'n'> & { n: number | null }> = [];
  for (const m of text.matchAll(BLANK_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const explicit = EXPLICIT_RE.exec(m[1]);
    if (explicit) {
      const [answer, ...hintParts] = explicit[2].split('::');
      const hint = hintParts.length > 0 ? hintParts.join('::') : null;
      raw.push({ start, end, n: Number(explicit[1]), answer, hint });
    } else {
      raw.push({ start, end, n: null, answer: m[1], hint: null });
    }
  }
  let next = Math.max(0, ...raw.map((b) => b.n ?? 0)) + 1;
  return raw.map((b) => ({ ...b, n: b.n ?? next++ }));
}

export function parseClozeNumbers(text: string): number[] {
  return [...new Set(parseBlanks(text).map((b) => b.n))].sort((a, b) => a - b);
}

export function renderCloze(text: string, n: number, reveal: boolean): string {
  let out = '';
  let pos = 0;
  for (const b of parseBlanks(text)) {
    out += text.slice(pos, b.start);
    if (b.n !== n) out += b.answer;
    else if (reveal) out += `**${b.answer}**`;
    else out += `**[${b.hint || '…'}]**`;
    pos = b.end;
  }
  return out + text.slice(pos);
}

/** The first blank in reading order, or null when the text has none. */
export function firstClozeBlank(text: string): { n: number; answer: string } | null {
  const [blank] = parseBlanks(text);
  return blank ? { n: blank.n, answer: blank.answer } : null;
}
