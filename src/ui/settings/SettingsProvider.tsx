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

function save(s: AppSettings) {
  repo.setKV(KV_KEY, s).catch((err: unknown) => console.error('Failed to save settings', err));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const latest = useRef<AppSettings>(DEFAULT_SETTINGS);
  // Keys patched before the stored value finished loading; they win over stored values.
  const pending = useRef<Partial<AppSettings>>({});
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    repo
      .getKV<Partial<AppSettings>>(KV_KEY)
      .catch((err: unknown) => {
        console.error('Failed to load settings', err);
        return undefined;
      })
      .then((stored) => {
        if (cancelled) return;
        loaded.current = true;
        const hasPending = Object.keys(pending.current).length > 0;
        const merged = { ...DEFAULT_SETTINGS, ...stored, ...pending.current };
        pending.current = {};
        latest.current = merged;
        setSettings(merged);
        if (hasPending) save(merged);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = darkMedia();
    const apply = () => applySettings(settings, document.documentElement, media?.matches ?? false);
    apply();
    if (!media) return;
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, [settings]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    if (loaded.current) save(next);
    else pending.current = { ...pending.current, ...patch };
  }, []);

  const value = useMemo(() => [settings, update] as [AppSettings, typeof update], [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
