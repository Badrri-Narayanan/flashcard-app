import { createContext, useContext } from 'react';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accent: 'indigo' | 'teal' | 'rose' | 'amber' | 'emerald' | 'violet';
  font: 'system' | 'serif' | 'rounded' | 'hyperlegible' | 'opendyslexic';
  monoFont: 'system-mono' | 'jetbrains' | 'fira';
  cardTextSize: 'S' | 'M' | 'L' | 'XL';
  density: 'compact' | 'comfortable';
  reduceMotion: 'system' | 'on' | 'off';
  flipAnimation: boolean;
  dailyGoal: number;
  dayStartHour: number;
  swipeGestures: boolean;
  autoReadAloud: boolean;
  confidencePromptDefault: boolean;
  showKeyboardHints: boolean;
  lastBackupAt: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'indigo',
  font: 'system',
  monoFont: 'system-mono',
  cardTextSize: 'M',
  density: 'comfortable',
  reduceMotion: 'system',
  flipAnimation: true,
  dailyGoal: 20,
  dayStartHour: 4,
  swipeGestures: true,
  autoReadAloud: false,
  confidencePromptDefault: true,
  showKeyboardHints: true,
  lastBackupAt: null,
};

export type SettingsContextValue = [AppSettings, (patch: Partial<AppSettings>) => void];

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
