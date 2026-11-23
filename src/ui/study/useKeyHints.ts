import { useEffect, useState } from 'react';
import { useSettings } from '../settings/settings';

const WIDE = '(min-width: 768px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function isWideViewport(): boolean {
  return matches(WIDE);
}

/** Keyboard hints show only when enabled in settings and the viewport is at least 768px wide. */
export function useKeyHints(): boolean {
  const [{ showKeyboardHints }] = useSettings();
  const [wide, setWide] = useState(() => matches(WIDE));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(WIDE);
    const onChange = () => setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return showKeyboardHints && wide;
}

export function usePrefersReducedMotion(): boolean {
  const [{ reduceMotion }] = useSettings();
  return reduceMotion === 'on' || (reduceMotion === 'system' && matches('(prefers-reduced-motion: reduce)'));
}
