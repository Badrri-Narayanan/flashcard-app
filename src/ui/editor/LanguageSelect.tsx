import { strings } from '../strings';

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function LanguageSelect({ label, value, onChange }: Props) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-800"
      >
        <option value="">{strings.editor.deckDefault}</option>
        {strings.editor.languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
