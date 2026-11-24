import { useEffect, useState } from 'react';
import { dayKey, endOfStudyDay } from '../../domain/day';

/**
 * The current study day's key. It changes at the next study-day boundary and when the app is resumed (becomes
 * visible or focused) on a new day, so live queries that read `Date.now()` can list it as a dependency and roll over.
 */
export function useStudyDayNow(dayStartHour: number): string {
  const [key, setKey] = useState(() => dayKey(Date.now(), dayStartHour));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const now = Date.now();
      setKey(dayKey(now, dayStartHour));
      clearTimeout(timer);
      timer = setTimeout(refresh, endOfStudyDay(now, dayStartHour) - now + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [dayStartHour]);

  return key;
}
