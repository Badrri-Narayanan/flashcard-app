/** Lowercase ASCII words joined by dashes; `fallback` when nothing usable remains (emoji, non-Latin names). */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `flashcards-<slug>-YYYY-MM-DD.<ext>` using the local date. */
export function exportFilename(name: string, fallback: string, ext: 'json' | 'csv', date: Date = new Date()): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `flashcards-${slugify(name, fallback)}-${day}.${ext}`;
}
