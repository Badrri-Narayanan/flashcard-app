import { forwardRef, type ClipboardEvent, type DragEvent } from 'react';

interface Props {
  label: string;
  value: string;
  rows?: number;
  required?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onImages: (files: File[]) => void;
}

const imagesOf = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

/** Textarea that accepts pasted or dropped images and reports them via onImages. */
const MarkdownField = forwardRef<HTMLTextAreaElement, Props>(function MarkdownField(
  { label, value, rows = 4, required, onChange, onFocus, onImages },
  ref,
) {
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imagesOf(e.clipboardData?.files);
    if (files.length === 0) return;
    e.preventDefault();
    onImages(files);
  }

  function onDrop(e: DragEvent<HTMLTextAreaElement>) {
    const files = imagesOf(e.dataTransfer?.files);
    if (files.length === 0) return;
    e.preventDefault();
    onImages(files);
  }

  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea
        ref={ref}
        dir="auto"
        value={value}
        rows={rows}
        aria-required={required}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
  );
});

export default MarkdownField;
