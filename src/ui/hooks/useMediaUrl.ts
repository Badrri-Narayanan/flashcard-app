import { useEffect, useState } from 'react';
import { repo } from '../../data/repo';

/** Object URL for a stored image (null while loading or if missing); revoked on unmount. */
export function useMediaUrl(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    repo
      .getMedia(id)
      .then((m) => {
        if (cancelled || !m) return;
        created = URL.createObjectURL(m.blob);
        setUrl(created);
      })
      .catch((err) => console.error('Failed to load media', err));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [id]);
  return url;
}
