import { useEffect, useMemo, useState } from 'react';
import { exportBackup, loadBackupMedia } from '../../data/backupIO';
import { repo } from '../../data/repo';
import { SHARE_QR_MAX, SHARE_URL_MAX, SHARE_URL_WARN, buildSharePayload, encodeShare } from '../../domain/share';
import type { Deck } from '../../domain/types';
import Dialog from '../components/Dialog';
import { strings } from '../strings';

interface Props {
  deck: Deck;
  onClose: () => void;
}

interface Built {
  url: string;
  droppedImages: number;
}

const button =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

function shareUrl(encoded: string): string {
  return `${window.location.origin}${window.location.pathname}#/share/${encoded}`;
}

function QrCode({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((qr) => qr.toString(url, { type: 'svg', margin: 1 }))
      .then((out) => !cancelled && setSvg(out))
      .catch((err) => console.error('Failed to render QR code', err));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!svg) return null;
  // The markup is generated locally by the qrcode library from our own URL.
  return <div role="img" aria-label={strings.share.qrLabel} className="mx-auto size-48 bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function ShareDialog({ deck, onClose }: Props) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cards = await repo.listCards(deck.id);
      const media = await loadBackupMedia(cards, (done, total) => !cancelled && setProgress({ done, total }));
      const { payload, droppedImages } = buildSharePayload(deck, cards, (id) => media.get(id));
      if (!cancelled) setBuilt({ url: shareUrl(encodeShare(payload)), droppedImages });
    })().catch((err) => {
      console.error('Failed to build share link', err);
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  const tooLong = built !== null && built.url.length > SHARE_URL_MAX;
  const canNativeShare = useMemo(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function', []);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNote(strings.share.copied);
    } catch {
      setNote(strings.share.copyFailed);
    }
  }

  async function nativeShare(url: string) {
    try {
      await navigator.share({ title: deck.name, url });
    } catch {
      // Dismissing the system sheet rejects with AbortError; nothing to report.
    }
  }

  async function download() {
    try {
      const blob = await exportBackup('deck', deck.id, { includeHistory: false });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${deck.name || 'deck'}.json`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error('Failed to export deck', err);
      setNote(strings.share.downloadFailed);
    }
  }

  return (
    <Dialog title={strings.share.title(deck.name)} onClose={onClose}>
      <div className="space-y-3">
        {!built && !error && <p>{progress && progress.total > 0 ? strings.share.preparingImages(progress.done, progress.total) : strings.share.preparing}</p>}
        {error && <p role="alert">{strings.share.loadFailed}</p>}
        {built && tooLong && (
          <>
            <h3 className="font-semibold">{strings.share.tooLongTitle}</h3>
            <p>{strings.share.tooLong}</p>
            <button type="button" onClick={() => void download()} className={button}>{strings.share.download}</button>
          </>
        )}
        {built && !tooLong && (
          <>
            <input
              readOnly
              aria-label={strings.share.linkLabel}
              value={built.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            {built.url.length > SHARE_URL_WARN && (
              <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <p>{strings.share.warnLong}</p>
                <button type="button" onClick={() => void download()} className={button}>{strings.share.download}</button>
              </div>
            )}
            {built.droppedImages > 0 && <p className="text-sm">{strings.share.droppedImages(built.droppedImages)}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy(built.url)} className={button}>{strings.share.copy}</button>
              {canNativeShare && (
                <button type="button" onClick={() => void nativeShare(built.url)} className={button}>{strings.share.nativeShare}</button>
              )}
            </div>
            {built.url.length <= SHARE_QR_MAX && <QrCode url={built.url} />}
            <p className="text-sm text-slate-600 dark:text-slate-400">{strings.share.noHistory}</p>
          </>
        )}
        <p role="status" className="min-h-5 text-sm">{note}</p>
      </div>
    </Dialog>
  );
}
