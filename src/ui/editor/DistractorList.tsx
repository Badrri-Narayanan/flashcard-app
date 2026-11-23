import { strings } from '../strings';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
}

const inputClass =
  'min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800';

export default function DistractorList({ values, onChange }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{strings.editor.distractors}</legend>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            aria-label={strings.editor.distractor(i + 1)}
            value={v}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            className={inputClass}
          />
          <button
            type="button"
            aria-label={strings.editor.removeDistractor(i + 1)}
            disabled={values.length <= 1}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="size-11 rounded-lg hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="min-h-11 rounded-lg px-3 text-sm font-medium text-accent-600 hover:bg-slate-100 dark:text-accent-500 dark:hover:bg-slate-800"
      >
        {strings.editor.addDistractor}
      </button>
    </fieldset>
  );
}
