import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_LANGS, languageOptions, voiceLangs } from '../../src/ui/settings/languages';

afterEach(() => vi.unstubAllGlobals());

describe('languages', () => {
  it('falls back to the common list when speechSynthesis is missing', () => {
    expect('speechSynthesis' in window).toBe(false);
    expect(voiceLangs()).toEqual([]);
    expect(languageOptions([]).map((o) => o.code)).toEqual([...FALLBACK_LANGS]);
  });

  it('merges unique voice languages with the fallbacks, without duplicates', () => {
    const codes = languageOptions(['sv-SE', 'en-US', 'sv-SE']).map((o) => o.code);
    expect(codes).toContain('sv-SE');
    expect(codes.filter((c) => c === 'en-US')).toHaveLength(1);
    expect(codes).toHaveLength(FALLBACK_LANGS.length + 1);
  });

  it('reads unique langs from getVoices', () => {
    vi.stubGlobal('speechSynthesis', { getVoices: () => [{ lang: 'sv-SE' }, { lang: 'sv_SE' }, { lang: 'nb-NO' }] });
    expect(voiceLangs()).toEqual(['nb-NO', 'sv-SE']);
  });
});
