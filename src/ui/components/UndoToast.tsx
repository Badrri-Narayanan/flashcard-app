import { useEffect, useRef } from 'react';
import { strings } from '../strings';
import { UNDO_TOAST_MS } from './toastTiming';

interface Props {
  message: string;
  onUndo?: () => void;
  actionLabel?: string;
  onClose: () => void;
  durationMs?: number;
}

export default function UndoToast({ message, onUndo, actionLabel, onClose, durationMs = UNDO_TOAST_MS }: Props) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const t = setTimeout(() => closeRef.current(), durationMs);
    return () => clearTimeout(t);
  }, [durationMs]);

  return (
    <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
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
          {actionLabel ?? strings.common.undo}
        </button>
      )}
    </div>
  );
}
