import { strings } from '../strings';

/** Swatches match the accent presets (Tailwind 500 shades). */
export const SWATCHES = [
  { value: '#6366f1', label: strings.dialog.colors.indigo },
  { value: '#14b8a6', label: strings.dialog.colors.teal },
  { value: '#f43f5e', label: strings.dialog.colors.rose },
  { value: '#f59e0b', label: strings.dialog.colors.amber },
  { value: '#10b981', label: strings.dialog.colors.emerald },
  { value: '#8b5cf6', label: strings.dialog.colors.violet },
] as const;

export const DEFAULT_COLOR = SWATCHES[0].value;
