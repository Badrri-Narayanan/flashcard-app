import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSettings } from '../settings/settings';
import type { Faces } from '../study/faces';
import { cancelSpeech, speak } from './speech';

/**
 * Read-aloud for a Learn/Cram card: returns a function that speaks the visible side, speaks the
 * answer on reveal when auto read-aloud is on, and stops speaking when the card changes or the session ends.
 */
export function useReadAloud(faces: Faces | null, revealed: boolean, cardKey: string | undefined): () => void {
  const [{ autoReadAloud }] = useSettings();
  const latest = useRef({ faces, revealed });
  useLayoutEffect(() => {
    latest.current = { faces, revealed };
  });

  const speakVisible = () => {
    const { faces: f, revealed: r } = latest.current;
    const part = r ? f?.back[f.back.length - 1] : f?.front;
    if (part) speak(part.text, part.lang);
  };

  useEffect(() => cancelSpeech, [cardKey]);

  useEffect(() => {
    if (autoReadAloud && revealed && cardKey) speakVisible();
  }, [autoReadAloud, revealed, cardKey]);

  return speakVisible;
}
