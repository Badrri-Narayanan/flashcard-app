import { describe, expect, it } from 'vitest';
import { exportFilename, slugify } from '../../src/domain/exportName';

describe('slugify', () => {
  it('lowercases ASCII and joins words with dashes', () => {
    expect(slugify('Spanish Verbs 101!', 'deck')).toBe('spanish-verbs-101');
  });
  it('strips diacritics', () => {
    expect(slugify('Café Français', 'deck')).toBe('cafe-francais');
  });
  it('falls back when nothing ASCII remains', () => {
    expect(slugify('📚📚', 'deck')).toBe('deck');
    expect(slugify('日本語', 'library')).toBe('library');
    expect(slugify('  --  ', 'deck')).toBe('deck');
  });
});

describe('exportFilename', () => {
  it('uses the local date', () => {
    expect(exportFilename('My Deck', 'deck', 'json', new Date(2026, 0, 5, 23, 59))).toBe('flashcards-my-deck-2026-01-05.json');
    expect(exportFilename('', 'library', 'csv', new Date(2026, 10, 23, 0, 1))).toBe('flashcards-library-2026-11-23.csv');
  });
});
