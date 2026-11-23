import type { KeyboardEvent } from 'react';
import { strings } from '../strings';
import { mergeTags } from './editorLogic';

interface Props {
  tags: string[];
  draft: string;
  onDraftChange: (draft: string) => void;
  onChange: (tags: string[]) => void;
}

export default function TagInput({ tags, draft, onDraftChange, onChange }: Props) {
  function commit(raw: string) {
    onChange(mergeTags(tags, raw));
    onDraftChange('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      commit(draft);
    }
  }

  return (
    <div>
      <label htmlFor="card-tags" className="text-sm font-medium">
        {strings.editor.tags}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 ps-3 text-sm dark:bg-slate-700">
            {t}
            <button
              type="button"
              aria-label={strings.editor.removeTag(t)}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="flex size-8 items-center justify-center rounded-full"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="card-tags"
          value={draft}
          placeholder={strings.editor.tagHint}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',') && !(e.nativeEvent as InputEvent).isComposing) commit(v);
            else onDraftChange(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          className="min-h-9 min-w-32 flex-1 bg-transparent px-1 outline-none"
        />
      </div>
    </div>
  );
}
