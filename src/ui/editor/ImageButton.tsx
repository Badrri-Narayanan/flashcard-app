import { useRef } from 'react';
import { strings } from '../strings';

interface Props {
  onPick: (file: File) => void;
}

export default function ImageButton({ onPick }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="min-h-11 rounded-lg px-3 text-sm font-medium text-accent-600 hover:bg-slate-100 dark:text-accent-500 dark:hover:bg-slate-800"
      >
        {strings.editor.addImage}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        data-testid="image-input"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
    </>
  );
}
