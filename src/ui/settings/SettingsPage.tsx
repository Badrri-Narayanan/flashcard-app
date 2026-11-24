import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getLastBackupAt } from '../../data/backupIO';
import { repo } from '../../data/repo';
import Dialog from '../components/Dialog';
import { runExport } from '../library/runExport';
import { strings } from '../strings';
import { useSettings, type AppSettings } from './settings';

const ACCENT_SWATCH: Record<AppSettings['accent'], string> = {
  indigo: '#4f46e5', teal: '#0d9488', rose: '#e11d48', amber: '#d97706', emerald: '#059669', violet: '#7c3aed',
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800';
const buttonClass =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      {label}
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={fieldClass}>
        {(Object.keys(options) as T[]).map((k) => (
          <option key={k} value={k}>{options[k]}</option>
        ))}
      </select>
    </label>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

type Unavailable = 'unavailable';

function useStorageInfo() {
  const [usage, setUsage] = useState<number | Unavailable | null>(null);
  const [persisted, setPersisted] = useState<boolean | Unavailable | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    const read = async <T,>(fn: (() => Promise<T>) | undefined): Promise<T | Unavailable> => {
      if (!fn) return 'unavailable';
      try {
        return await fn.call(storage);
      } catch {
        return 'unavailable';
      }
    };
    void read(storage?.estimate).then((e) => {
      if (!cancelled) setUsage(e === 'unavailable' ? e : (e.usage ?? 'unavailable'));
    });
    void read(storage?.persisted).then((p) => {
      if (!cancelled) setPersisted(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist() {
    setDenied(false);
    try {
      const ok = await navigator.storage.persist();
      setPersisted(ok);
      setDenied(!ok);
    } catch {
      setDenied(true);
    }
  }
  return { usage, persisted, denied, persist, canPersist: typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function' };
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const t = strings.settings;

  async function run() {
    setBusy(true);
    setError(false);
    try {
      await repo.resetAll();
      window.location.hash = '#/';
      window.location.reload();
    } catch (err) {
      console.error('Failed to reset app', err);
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Dialog title={t.resetTitle} onClose={onClose}>
      <div className="space-y-4">
        <p>{t.resetWarning}</p>
        <label className="block text-sm font-medium">
          {t.resetPrompt}
          <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className={fieldClass} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{t.resetFailed}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>{strings.common.cancel}</button>
          <button
            type="button"
            disabled={text !== 'RESET' || busy}
            onClick={() => void run()}
            className="min-h-11 rounded-lg bg-rose-600 px-4 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {t.resetConfirm}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function SettingsPage() {
  const [s, patch] = useSettings();
  const t = strings.settings;
  const storage = useStorageInfo();
  const lastBackupAt = useLiveQuery(getLastBackupAt, []);
  const [goalText, setGoalText] = useState(String(s.dailyGoal));
  const [exportError, setExportError] = useState(false);
  const [resetting, setResetting] = useState(false);

  // The stored value loads after first render; follow it unless it already matches what is typed.
  const [syncedGoal, setSyncedGoal] = useState(s.dailyGoal);
  if (syncedGoal !== s.dailyGoal) {
    setSyncedGoal(s.dailyGoal);
    if (Number(goalText) !== s.dailyGoal) setGoalText(String(s.dailyGoal));
  }

  const goalValid = /^\d+$/.test(goalText.trim()) && Number(goalText) >= 1;
  const goalId = useId();

  async function exportLibrary() {
    setExportError(false);
    try {
      await runExport('library', null, 'json', true);
    } catch (err) {
      console.error('Failed to export', err);
      setExportError(true);
    }
  }

  const unavailable = <span>{t.notAvailable}</span>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      <Section title={t.appearance}>
        <Select label={t.theme} value={s.theme} options={t.themes} onChange={(theme) => patch({ theme })} />
        <fieldset>
          <legend className="text-sm font-medium">{t.accent}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(ACCENT_SWATCH) as AppSettings['accent'][]).map((a) => (
              <button
                key={a}
                type="button"
                aria-label={t.accents[a]}
                aria-pressed={s.accent === a}
                onClick={() => patch({ accent: a })}
                style={{ backgroundColor: ACCENT_SWATCH[a] }}
                className={`size-11 rounded-full border-2 ${s.accent === a ? 'border-slate-900 ring-2 ring-offset-2 dark:border-white' : 'border-transparent'}`}
              />
            ))}
          </div>
        </fieldset>
        <Select label={t.font} value={s.font} options={t.fonts} onChange={(font) => patch({ font })} />
        <p data-testid="font-sample" style={{ fontFamily: 'var(--font-ui)' }} className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
          {t.fontSample}
        </p>
        <Select label={t.monoFont} value={s.monoFont} options={t.monoFonts} onChange={(monoFont) => patch({ monoFont })} />
        <p data-testid="mono-sample" style={{ fontFamily: 'var(--font-mono)' }} className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
          {t.codeSample}
        </p>
        <Select label={t.cardTextSize} value={s.cardTextSize} options={t.sizes} onChange={(cardTextSize) => patch({ cardTextSize })} />
        <div
          data-testid="sample-card"
          style={{ fontSize: 'calc(1rem * var(--card-scale))', fontFamily: 'var(--font-ui)' }}
          className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="font-semibold">{t.sampleCardFront}</p>
          <p className="text-slate-600 dark:text-slate-400">{t.sampleCardBack}</p>
        </div>
        <Select label={t.density} value={s.density} options={t.densities} onChange={(density) => patch({ density })} />
        <Select label={t.reduceMotion} value={s.reduceMotion} options={t.motion} onChange={(reduceMotion) => patch({ reduceMotion })} />
        <Toggle label={t.flipAnimation} checked={s.flipAnimation} onChange={(flipAnimation) => patch({ flipAnimation })} />
      </Section>

      <Section title={t.study}>
        <div>
          <label htmlFor={goalId} className="block text-sm font-medium">{t.dailyGoal}</label>
          <input
            id={goalId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={goalText}
            aria-invalid={!goalValid}
            aria-describedby={goalValid ? undefined : `${goalId}-err`}
            onChange={(e) => {
              setGoalText(e.target.value);
              if (/^\d+$/.test(e.target.value.trim()) && Number(e.target.value) >= 1) patch({ dailyGoal: Number(e.target.value) });
            }}
            className={fieldClass}
          />
          {!goalValid && <p id={`${goalId}-err`} role="alert" className="mt-1 text-sm text-rose-600 dark:text-rose-400">{t.dailyGoalInvalid}</p>}
        </div>
        <label className="block text-sm font-medium">
          {t.dayStartHour}
          <select value={s.dayStartHour} onChange={(e) => patch({ dayStartHour: Number(e.target.value) })} className={fieldClass}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{t.hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <Toggle label={t.swipeGestures} checked={s.swipeGestures} onChange={(swipeGestures) => patch({ swipeGestures })} />
        <Toggle label={t.autoReadAloud} checked={s.autoReadAloud} onChange={(autoReadAloud) => patch({ autoReadAloud })} />
        <Toggle label={t.confidencePromptDefault} checked={s.confidencePromptDefault} onChange={(confidencePromptDefault) => patch({ confidencePromptDefault })} />
        <Toggle label={t.showKeyboardHints} checked={s.showKeyboardHints} onChange={(showKeyboardHints) => patch({ showKeyboardHints })} />
      </Section>

      <Section title={t.data}>
        <dl className="space-y-2">
          <div className="flex justify-between gap-2">
            <dt>{t.storageUsed}</dt>
            <dd>{typeof storage.usage === 'number' ? formatBytes(storage.usage) : storage.usage === 'unavailable' ? unavailable : '…'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t.persistence}</dt>
            <dd>
              {typeof storage.persisted === 'boolean' ? (storage.persisted ? t.persisted : t.notPersisted) : storage.persisted === 'unavailable' ? unavailable : '…'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t.lastBackup}</dt>
            <dd>{lastBackupAt ? new Date(lastBackupAt).toLocaleDateString() : t.never}</dd>
          </div>
        </dl>
        {storage.canPersist && storage.persisted === false && (
          <button type="button" onClick={() => void storage.persist()} className={buttonClass}>{t.keepSafe}</button>
        )}
        {storage.denied && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{t.keepSafeDenied}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportLibrary()} className={buttonClass}>{t.exportLibrary}</button>
          <Link to="/import" className={buttonClass}>{t.import}</Link>
          <button type="button" onClick={() => setResetting(true)} className={`${buttonClass} text-rose-600 dark:text-rose-400`}>{t.reset}</button>
        </div>
        {exportError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{t.exportFailed}</p>}
      </Section>

      <Section title={t.about}>
        <p>{t.version}: {__APP_VERSION__}</p>
      </Section>

      {resetting && <ResetDialog onClose={() => setResetting(false)} />}
    </div>
  );
}
