import { useEffect, useState } from 'react';
import { strings } from '../strings';

export const FALLBACK_LANGS = [
  'en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-BR', 'ja-JP', 'zh-CN', 'ko-KR', 'hi-IN', 'ar-SA', 'ru-RU',
] as const;

export interface LanguageOption {
  code: string;
  label: string;
}

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
}

/** Sorted unique BCP-47 tags of the installed voices; empty when speech synthesis is unavailable. */
export function voiceLangs(): string[] {
  const voices = synth()?.getVoices() ?? [];
  return [...new Set(voices.map((v) => v.lang.replace('_', '-')).filter(Boolean))].sort();
}

const knownLabels = new Map<string, string>(strings.editor.languages.map((l) => [l.code, l.label]));

/** Fallback languages first, then any extra voice languages; every code appears once. */
export function languageOptions(extra: string[]): LanguageOption[] {
  const codes = [...new Set([...FALLBACK_LANGS, ...extra])];
  return codes.map((code) => ({ code, label: knownLabels.get(code) ?? code }));
}

/** Language options that grow when the browser finishes loading its voice list. */
export function useLanguageOptions(): LanguageOption[] {
  const [langs, setLangs] = useState<string[]>(voiceLangs);
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const refresh = () => setLangs(voiceLangs());
    s.addEventListener?.('voiceschanged', refresh);
    return () => s.removeEventListener?.('voiceschanged', refresh);
  }, []);
  return languageOptions(langs);
}
