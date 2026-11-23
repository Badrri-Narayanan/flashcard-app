import Dialog from '../components/Dialog';
import { strings } from '../strings';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const btn = 'min-h-11 rounded-lg px-4 font-medium';

/** Confirm dialog; keystrokes stay inside so the editor's Ctrl+Enter shortcut can't fire behind it. */
export default function ConfirmDialog({ title, body, confirmLabel, cancelLabel = strings.common.cancel, onConfirm, onCancel }: Props) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div onKeyDown={(e) => e.stopPropagation()}>
        <p>{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`${btn} hover:bg-slate-100 dark:hover:bg-slate-800`}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={`${btn} bg-accent-600 text-white hover:bg-accent-700`}>{confirmLabel}</button>
        </div>
      </div>
    </Dialog>
  );
}
