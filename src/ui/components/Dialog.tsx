import { useEffect, useId, useRef, type ReactNode } from 'react';
import { strings } from '../strings';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal built on native <dialog>: focus is trapped and Esc closes it. */
export default function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Captured once so StrictMode's second effect run doesn't overwrite it with focus inside the dialog.
    if (opener.current === undefined) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    return () => {
      const target = opener.current;
      if (target?.isConnected) target.focus();
      else document.querySelector<HTMLElement>('main')?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.common.close}
          className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ×
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
