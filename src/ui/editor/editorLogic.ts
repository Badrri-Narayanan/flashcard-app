import { parseClozeNumbers, renderCloze } from '../../domain/cloze';
import type { CardType } from '../../domain/types';
import { strings } from '../strings';

export interface EditorForm {
  type: CardType;
  front: string;
  back: string;
  distractors: string[];
  mnemonic: string;
  tags: string[];
  langFront: string | null;
  langBack: string | null;
}

export const EMPTY_FORM: EditorForm = {
  type: 'basic',
  front: '',
  back: '',
  distractors: [''],
  mnemonic: '',
  tags: [],
  langFront: null,
  langBack: null,
};

export function validate(form: EditorForm): string[] {
  const errors: string[] = [];
  if (!form.front.trim()) errors.push(strings.editor.frontRequired);
  else if (form.type === 'cloze' && parseClozeNumbers(form.front).length === 0) errors.push(strings.editor.clozeNeedsBlank);
  if (form.type === 'mcq' && form.distractors.every((d) => !d.trim())) errors.push(strings.editor.mcqNeedsDistractor);
  return errors;
}

/** Wraps text[start,end) as `{{cN::…}}` using the next free blank number; null when nothing is selected. */
export function wrapBlank(text: string, start: number, end: number): { text: string; caret: number } | null {
  if (start === end) return null;
  const next = Math.max(0, ...parseClozeNumbers(text)) + 1;
  const wrapped = `{{c${next}::${text.slice(start, end)}}}`;
  return { text: text.slice(0, start) + wrapped + text.slice(end), caret: start + wrapped.length };
}

export function insertAt(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

/** Front text as shown in the live preview (cloze blanks revealed). */
export function previewFront(form: EditorForm): string {
  if (form.type !== 'cloze') return form.front;
  const [first] = parseClozeNumbers(form.front);
  return first === undefined ? form.front : renderCloze(form.front, first, true);
}

/** Plain-text one-liner for list rows. */
export function plainPreview(markdown: string, max = 80): string {
  const text = markdown
    .replace(/\{\{(?:c\d+::)?(.*?)(?:::.*?)?\}\}/gs, '$1')
    .replace(/```[\w+-]*/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\$+/g, '')
    .replace(/[`*_#>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
