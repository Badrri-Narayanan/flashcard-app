import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { repo } from '../../data/repo';
import { applySettings } from './applySettings';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from './settings';

const KV_KEY = 'settings';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function darkMedia(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY)
    : null;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const latest = useRef<AppSettings>(DEFAULT_SETTINGS);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void repo.getKV<Partial<AppSettings>>(KV_KEY).then((stored) => {
      // A patch made before load finished wins; just fill in stored values underneath.
      if (cancelled || !stored) return;
      const merged = { ...DEFAULT_SETTINGS, ...stored, ...(touched.current ? latest.current : {}) };
      latest.current = merged;
      setSettings(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = darkMedia();
    const apply = () => applySettings(settings, document.documentElement, media?.matches ?? false);
    apply();
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [settings]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    touched.current = true;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    void repo.setKV(KV_KEY, next);
  }, []);

  const value = useMemo(() => [settings, update] as [AppSettings, typeof update], [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
