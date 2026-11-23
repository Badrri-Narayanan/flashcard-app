import { useEffect, useLayoutEffect, useRef } from 'react';

type KeyMap = Record<string, () => void>;

const IGNORED_TARGETS = 'input, textarea, select, [contenteditable="true"], dialog';

/** Window-level shortcuts for study screens. Keys are `event.key` (letters lowercase, Space is ' '). */
export function useStudyKeys(map: KeyMap, enabled = true): void {
  const latest = useRef(map);
  useLayoutEffect(() => {
    latest.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(IGNORED_TARGETS)) return;
      // Let focused buttons/links keep their native Space/Enter activation.
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a')) return;
      const handler = latest.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
