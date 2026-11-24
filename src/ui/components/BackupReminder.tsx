import { useEffect, useState } from 'react';
import { getLastBackupAt } from '../../data/backupIO';
import { repo } from '../../data/repo';
import { runExport } from '../library/runExport';
import { strings } from '../strings';

const MIN_CARDS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 14 * DAY_MS;
const SNOOZE_MS = 7 * DAY_MS;
const SNOOZE_KEY = 'backupSnoozeUntil';

export default function BackupReminder() {
  const [cards, setCards] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const t = strings.pwa;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [all, last, snoozeUntil] = await Promise.all([repo.listAllCards(), getLastBackupAt(), repo.getKV<number>(SNOOZE_KEY)]);
      const now = Date.now();
      const stale = last === null || now - last > STALE_AFTER_MS;
      const snoozed = typeof snoozeUntil === 'number' && snoozeUntil > now;
      if (!cancelled && all.length >= MIN_CARDS && stale && !snoozed) setCards(all.length);
    })().catch((err: unknown) => console.error('Failed to check backup reminder', err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (cards === null) return null;

  async function snooze() {
    setCards(null);
    try {
      await repo.setKV(SNOOZE_KEY, Date.now() + SNOOZE_MS);
    } catch (err) {
      console.error('Failed to snooze backup reminder', err);
    }
  }

  async function backUp() {
    setFailed(false);
    try {
      await runExport('library', null, 'json', false);
      setCards(null);
    } catch (err) {
      console.error('Backup from reminder failed', err);
      setFailed(true);
    }
  }

  const action = 'min-h-11 rounded-lg px-4 font-semibold';
  return (
    <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p>{t.reminderTitle(cards)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={backUp} className={`${action} bg-amber-700 text-white hover:bg-amber-800`}>{t.backUpNow}</button>
        <button type="button" onClick={snooze} className={`${action} border border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900`}>{t.remindLater}</button>
      </div>
      {failed && <p className="mt-2 font-medium">{t.backupFailed}</p>}
    </div>
  );
}
