import { useRegisterSW } from 'virtual:pwa-register/react';
import { strings } from '../strings';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg md:bottom-4 dark:bg-slate-100 dark:text-slate-900">
      <span>{strings.pwa.updateAvailable}</span>
      <button type="button" onClick={() => void updateServiceWorker(true)} className="min-h-11 rounded-lg bg-accent-600 px-4 font-semibold text-white">
        {strings.pwa.reload}
      </button>
    </div>
  );
}
