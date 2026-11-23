import { useEffect, useState } from 'react';
import { repo } from '../../data/repo';

export type MediaStatus = 'loading' | 'ready' | 'missing';

/** Object URL for a stored image, revoked on unmount; status tells loading apart from missing. */
export function useMediaUrl(id: string): { url: string | null; status: MediaStatus } {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<MediaStatus>('loading');
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    repo
      .getMedia(id)
      .then((m) => {
        if (cancelled) return;
        if (!m) return setStatus('missing');
        created = URL.createObjectURL(m.blob);
        setUrl(created);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load media', err);
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
      setStatus('loading');
    };
  }, [id]);
  return { url, status };
}
