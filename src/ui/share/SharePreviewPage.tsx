import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { decodeShare, type SharePayload } from '../../domain/share';
import type { Id } from '../../domain/types';
import CardContent from '../components/CardContent';
import MovePicker from '../library/MovePicker';
import { strings } from '../strings';
import { importShare, type ShareImportMode } from './importShare';

const PREVIEW_CARDS = 5;
const MEDIA_MARKDOWN = /!\[[^\]]*\]\(media:[\w-]+\)/g;

const primary = 'inline-flex min-h-11 items-center rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700';
const secondary =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

const withPlaceholders = (text: string) => text.replace(MEDIA_MARKDOWN, strings.sharePreview.imagePlaceholder);

export default function SharePreviewPage() {
  const encoded = useParams()['*'] ?? '';
  const decoded = useMemo(() => decodeShare(encoded), [encoded]);

  if (!decoded.ok) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{strings.sharePreview.errorTitle}</h1>
        <p role="alert">{decoded.reason === 'truncated' ? strings.sharePreview.errorTruncated : strings.sharePreview.errorInvalid}</p>
        <Link to="/" className={primary}>{strings.common.goHome}</Link>
      </section>
    );
  }
  return <Preview payload={decoded.payload} />;
}

function Preview({ payload }: { payload: SharePayload }) {
  const data = useLiveQuery(async () => ({ decks: await repo.listDecks(), folders: await repo.listFolders() }), []);
  const [picking, setPicking] = useState<ShareImportMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ message: string; deckId: Id } | null>(null);
  const [failed, setFailed] = useState(false);

  const { deck, cards } = payload;
  if (!data) return <p className="px-4 py-8">{strings.common.loading}</p>;

  const canUpdate = data.decks.some((d) => d.id === deck.id);
  const hasCopy = canUpdate || data.decks.some((d) => d.sourceId === deck.id);

  async function run(mode: ShareImportMode, folderId: Id | null) {
    setPicking(null);
    setBusy(true);
    setFailed(false);
    try {
      const result = await importShare(payload, mode, folderId);
      const { added, updated } = result.summary;
      const message =
        mode === 'update'
          ? updated > 0 ? strings.sharePreview.updated(deck.name) : strings.sharePreview.upToDate(deck.name)
          : added > 0 ? strings.sharePreview.added(deck.name) : strings.sharePreview.upToDate(deck.name);
      setOutcome({ message, deckId: result.deckId });
    } catch (err) {
      console.error('Failed to import shared deck', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold">{`${deck.emoji} ${deck.name}`}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {strings.sharePreview.title} · {strings.sharePreview.cards(cards.length)}
      </p>
      {deck.description && <p>{deck.description}</p>}

      <h2 className="font-semibold">{strings.sharePreview.firstCards}</h2>
      <ul className="space-y-2">
        {cards.slice(0, PREVIEW_CARDS).map((c) => (
          <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <CardContent markdown={withPlaceholders(c.front)} lang={c.langFront} />
            <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
              <CardContent markdown={withPlaceholders(c.back)} lang={c.langBack} />
            </div>
          </li>
        ))}
      </ul>

      {outcome ? (
        <div role="status" className="space-y-2">
          <p>{outcome.message}</p>
          <Link to={`/deck/${outcome.deckId}`} className={primary}>{strings.sharePreview.openDeck}</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {hasCopy && <p className="text-sm">{strings.sharePreview.haveCopy}</p>}
          <div className="flex flex-wrap gap-2">
            {canUpdate && (
              <button type="button" disabled={busy} onClick={() => void run('update', null)} className={primary}>
                {strings.sharePreview.update}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setPicking(hasCopy ? 'copy' : 'add')} className={canUpdate ? secondary : primary}>
              {hasCopy ? strings.sharePreview.addCopy : strings.sharePreview.add}
            </button>
          </div>
          {failed && <p role="alert">{strings.sharePreview.failed}</p>}
        </div>
      )}

      {picking && (
        <MovePicker
          node={{ kind: 'deck', id: '', name: deck.name, emoji: deck.emoji, color: deck.color, children: [] }}
          title={strings.sharePreview.pickTitle(deck.name)}
          folders={data.folders}
          onPick={(folderId) => void run(picking, folderId)}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}
