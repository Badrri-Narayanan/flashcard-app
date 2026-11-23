import { useId, useState, type FormEvent } from 'react';
import Dialog from '../components/Dialog';
import { strings } from '../strings';
import { DEFAULT_COLOR, SWATCHES } from './palette';

export interface EntityValues {
  name: string;
  description: string;
  emoji: string;
  color: string;
}

interface Props {
  title: string;
  initial: Partial<EntityValues>;
  defaultEmoji: string;
  onSubmit: (values: EntityValues) => Promise<void>;
  onClose: () => void;
}

const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800';

/** Shared form for the folder and deck dialogs. */
export default function EntityDialog({ title, initial, defaultEmoji, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [emoji, setEmoji] = useState(initial.emoji ?? defaultEmoji);
  const [color, setColor] = useState(initial.color || DEFAULT_COLOR);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), emoji: emoji.trim() || defaultEmoji, color });
      onClose();
    } catch (err) {
      console.error('Failed to save', err);
      setSaving(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block text-sm font-medium">
          {strings.dialog.name}
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(false);
            }}
            aria-invalid={error}
            aria-describedby={error ? errorId : undefined}
            className={fieldClass}
          />
        </label>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-rose-600">
            {strings.dialog.nameRequired}
          </p>
        )}
        <label className="block text-sm font-medium">
          {strings.dialog.description}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          {strings.dialog.emoji}
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className={`${fieldClass} w-24 text-center text-xl`} />
        </label>
        <div role="radiogroup" aria-label={strings.dialog.color}>
          <span className="text-sm font-medium">{strings.dialog.color}</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={color === s.value}
                aria-label={s.label}
                onClick={() => setColor(s.value)}
                style={{ backgroundColor: s.value }}
                className={`size-11 rounded-full ${color === s.value ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white' : ''}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
            {strings.common.cancel}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {strings.common.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
