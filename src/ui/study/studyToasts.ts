import type { StudyToast } from './troubleCheck';

/** Maps a study session's notice to ToastRegion entries; an action toast stays longer and navigates on click. */
export function studyToasts(notice: StudyToast | null, navigate: (to: string) => void) {
  if (!notice) return [];
  const { action } = notice;
  return [{
    id: notice.id,
    message: notice.message,
    durationMs: action ? 8000 : 4000,
    actionLabel: action?.label,
    onUndo: action ? () => navigate(action.to) : undefined,
  }];
}
