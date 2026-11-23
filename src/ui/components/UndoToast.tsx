import { useEffect } from 'react';
import { strings } from '../strings';

export const UNDO_TOAST_MS = 8000;

interface Props {
  message: string;
  onUndo?: () => void;
  onClose: () => void;
  durationMs?: number;
}

export default function UndoToast({ message, onUndo, onClose, durationMs = UNDO_TOAST_MS }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [message, onClose, durationMs]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6 dark:bg-slate-100 dark:text-slate-900"
    >
      <span>{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onClose();
          }}
          className="min-h-11 rounded-lg px-3 font-semibold text-accent-500 hover:underline"
        >
          {strings.common.undo}
        </button>
      )}
    </div>
  );
}
