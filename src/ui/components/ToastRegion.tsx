import UndoToast from './UndoToast';

interface ToastLike {
  id: number;
  message: string;
  onUndo?: () => void;
  durationMs: number;
}

interface Props {
  toasts: ToastLike[];
  onClose: (id: number) => void;
}

/** Always-mounted live region so screen readers announce toasts as they appear. */
export default function ToastRegion({ toasts, onClose }: Props) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md flex-col gap-2 md:bottom-6"
    >
      {toasts.map((t) => (
        <UndoToast key={t.id} message={t.message} onUndo={t.onUndo} durationMs={t.durationMs} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}
