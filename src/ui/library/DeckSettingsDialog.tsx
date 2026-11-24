import { useId, useState, type FormEvent } from 'react';
import { repo } from '../../data/repo';
import type { Deck } from '../../domain/types';
import Dialog from '../components/Dialog';
import { useLanguageOptions } from '../settings/languages';
import { strings } from '../strings';

interface Props {
  deck: Deck;
  onClose: () => void;
}

const MAX_LIMIT = 9999;
const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800';

function parseLimit(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n <= MAX_LIMIT ? n : null;
}

/** Per-deck daily limits, confidence prompt and speech languages. */
export default function DeckSettingsDialog({ deck, onClose }: Props) {
  const s = deck.settings;
  const [newPerDay, setNewPerDay] = useState(String(s.newPerDay));
  const [reviewsPerDay, setReviewsPerDay] = useState(String(s.reviewsPerDay));
  const [confidence, setConfidence] = useState(s.confidencePrompt);
  const [langFront, setLangFront] = useState(s.langFront);
  const [langBack, setLangBack] = useState(s.langBack);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const languages = useLanguageOptions();
  const newId = useId();
  const reviewsId = useId();

  const newValue = parseLimit(newPerDay);
  const reviewsValue = parseLimit(reviewsPerDay);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(false);
    if (newValue === null || reviewsValue === null) return;
    setSaving(true);
    try {
      await repo.saveDeck({
        ...deck,
        settings: { newPerDay: newValue, reviewsPerDay: reviewsValue, confidencePrompt: confidence, langFront, langBack },
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to save deck settings', err);
      setSaveError(true);
      setSaving(false);
    }
  }

  const limit = (label: string, id: string, value: string, set: (v: string) => void, valid: boolean) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_LIMIT}
        step={1}
        value={value}
        aria-invalid={submitted && !valid}
        aria-describedby={submitted && !valid ? `${id}-err` : undefined}
        onChange={(e) => set(e.target.value)}
        className={fieldClass}
      />
      {submitted && !valid && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-rose-600">{strings.deckSettings.invalidLimit}</p>
      )}
    </div>
  );

  const langSelect = (label: string, value: string, set: (v: string) => void) => (
    <label className="block text-sm font-medium">
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} className={fieldClass}>
        <option value="">{strings.deckSettings.none}</option>
        {!value || languages.some((l) => l.code === value) ? null : <option value={value}>{value}</option>}
        {languages.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <Dialog title={strings.deckSettings.title(deck.name)} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {limit(strings.deckSettings.newPerDay, newId, newPerDay, setNewPerDay, newValue !== null)}
        {limit(strings.deckSettings.reviewsPerDay, reviewsId, reviewsPerDay, setReviewsPerDay, reviewsValue !== null)}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={confidence} onChange={(e) => setConfidence(e.target.checked)} className="size-4" />
          {strings.deckSettings.confidencePrompt}
        </label>
        {langSelect(strings.deckSettings.langFront, langFront, setLangFront)}
        {langSelect(strings.deckSettings.langBack, langBack, setLangBack)}
        {saveError && <p role="alert" className="text-sm text-rose-600">{strings.deckSettings.saveFailed}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            {strings.common.cancel}
          </button>
          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700 disabled:opacity-50">
            {strings.common.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
