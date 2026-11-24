import { repo } from '../../data/repo';
import { DEFAULT_DECK_SETTINGS, type DeckSettings } from '../../domain/types';
import type { AppSettings } from './settings';

/** Settings for a freshly created deck; the app-wide confidence-prompt default seeds the deck's own choice. */
export async function newDeckSettings(): Promise<DeckSettings> {
  const stored = await repo.getKV<Partial<AppSettings>>('settings');
  return { ...DEFAULT_DECK_SETTINGS, confidencePrompt: stored?.confidencePromptDefault ?? DEFAULT_DECK_SETTINGS.confidencePrompt };
}
