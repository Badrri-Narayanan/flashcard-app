import type { AppSettings } from './settings';

/**
 * RGB triplets for the accent-50 / -500 / -600 / -700 slots. The 600 and 700 slots carry white button text, so
 * teal, rose, amber and emerald use Tailwind's 700 / 800 shades there to keep at least 4.5:1 contrast.
 */
export const ACCENTS: Record<AppSettings['accent'], [string, string, string, string]> = {
  indigo: ['238 242 255', '99 102 241', '79 70 229', '67 56 202'],
  teal: ['240 253 250', '20 184 166', '15 118 110', '17 94 89'],
  rose: ['255 241 242', '244 63 94', '190 18 60', '159 18 57'],
  amber: ['255 251 235', '245 158 11', '180 83 9', '146 64 14'],
  emerald: ['236 253 245', '16 185 129', '4 120 87', '6 95 70'],
  violet: ['245 243 255', '139 92 246', '124 58 237', '109 40 217'],
};

const UI_FONTS: Record<AppSettings['font'], string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: '"Merriweather", Georgia, serif',
  rounded: '"Nunito", ui-rounded, system-ui, sans-serif',
  hyperlegible: '"Atkinson Hyperlegible", system-ui, sans-serif',
  opendyslexic: '"OpenDyslexic", "Atkinson Hyperlegible", sans-serif',
};

const MONO_FONTS: Record<AppSettings['monoFont'], string> = {
  'system-mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  jetbrains: '"JetBrains Mono", ui-monospace, monospace',
  fira: '"Fira Code", ui-monospace, monospace',
};

const CARD_SCALE: Record<AppSettings['cardTextSize'], string> = {
  S: '0.9',
  M: '1',
  L: '1.2',
  XL: '1.45',
};

export function applySettings(s: AppSettings, root: HTMLElement, prefersDark: boolean): void {
  const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);

  const [a50, a500, a600, a700] = ACCENTS[s.accent];
  root.style.setProperty('--accent-50', a50);
  root.style.setProperty('--accent-500', a500);
  root.style.setProperty('--accent-600', a600);
  root.style.setProperty('--accent-700', a700);

  root.style.setProperty('--font-ui', UI_FONTS[s.font]);
  root.style.setProperty('--font-mono', MONO_FONTS[s.monoFont]);
  root.style.setProperty('--card-scale', CARD_SCALE[s.cardTextSize]);

  root.dataset.accent = s.accent;
  root.dataset.density = s.density;
  root.dataset.reduceMotion = s.reduceMotion;
}
