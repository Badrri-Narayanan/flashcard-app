import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { StorageFullError } from '../../data/repository';
import { guessMapping, isImportable, parseCsv, rowsToDrafts, type CsvField } from '../../domain/csv';
import { baseRecord } from '../../domain/ids';
import { DEFAULT_DECK_SETTINGS, type Card, type Deck, type Id } from '../../domain/types';
import Dialog from '../components/Dialog';
import { UNDO_TOAST_MS } from '../components/toastTiming';
import { DEFAULT_COLOR } from '../library/palette';
import { strings } from '../strings';

interface Props {
  open: boolean;
  onClose: () => void;
  deckId?: Id;
}

const NEW_DECK = '__new__';
const PREVIEW_LIMIT = 10;
const FIELDS: CsvField[] = ['front', 'back', 'tags', 'type', 'mnemonic', 'distractors', 'ignore'];

const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function CsvImportDialog({ open, onClose, deckId }: Props) {
  const [created, setCreated] = useState<{ count: number; deckId: Id } | null>(null);

  useEffect(() => {
    if (!created) return;
    const t = setTimeout(() => setCreated(null), UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [created]);

  return (
    <>
      {open && (
        <CsvLoader
          deckId={deckId}
          onClose={onClose}
          onCreated={(count, target) => {
            setCreated({ count, deckId: target });
            onClose();
          }}
        />
      )}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md md:bottom-6">
        {created && (
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            <span>{strings.csv.created(created.count)}</span>
            <Link to={`/deck/${created.deckId}`} className="inline-flex min-h-11 items-center px-3 font-semibold text-accent-500 hover:underline">
              {strings.csv.viewDeck}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function CsvLoader(props: Omit<FormProps, 'decks'>) {
  const decks = useLiveQuery(() => repo.listDecks(), []);
  return decks ? <CsvForm {...props} decks={decks} /> : null;
}

interface FormProps {
  decks: Deck[];
  deckId?: Id;
  onClose: () => void;
  onCreated: (count: number, deckId: Id) => void;
}

function CsvForm({ decks, deckId, onClose, onCreated }: FormProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [mapping, setMapping] = useState<CsvField[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameErrorId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  // Runs after Dialog's own effect has opened the modal; focus() inside a closed <dialog> is a no-op.
  useEffect(() => {
    fileRef.current?.focus();
  }, []);

  const target = choice ?? (deckId && decks.some((d) => d.id === deckId) ? deckId : (decks[0]?.id ?? NEW_DECK));

  async function load(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const result = parseCsv(await readText(file));
      if (result.rows.length === 0) {
        setParsed(null);
        setFileError(strings.csv.empty);
        return;
      }
      const columns = Math.max(result.headers?.length ?? 0, ...result.rows.map((r) => r.length));
      setParsed(result);
      setMapping(guessMapping(result.headers, columns));
    } catch (err) {
      console.error('Failed to read CSV', err);
      setParsed(null);
      setFileError(strings.csv.readFailed);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    void load(e.dataTransfer.files[0]);
  }

  const { valid, skipped } = useMemo(() => {
    const drafts = parsed ? rowsToDrafts(parsed.rows, mapping) : [];
    const ok = drafts.filter(isImportable);
    return { valid: ok, skipped: drafts.length - ok.length };
  }, [parsed, mapping]);
  const preview = valid.slice(0, PREVIEW_LIMIT);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (valid.length === 0 || saving) return;
    if (target === NEW_DECK && !newName.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const destination = await repo.transaction(async () => {
        let id = target;
        if (target === NEW_DECK) {
          id = baseRecord().id;
          await repo.saveDeck({
            ...baseRecord(),
            id,
            folderId: null,
            name: newName.trim(),
            description: '',
            color: DEFAULT_COLOR,
            emoji: '📚',
            order: 0,
            settings: { ...DEFAULT_DECK_SETTINGS },
            sourceId: null,
            matchBestMs: null,
          });
        }
        const cards: Card[] = valid.map((d) => ({
          ...baseRecord(),
          deckId: id,
          type: d.type ?? 'basic',
          front: d.front ?? '',
          back: d.back ?? '',
          distractors: d.distractors ?? [],
          mnemonic: d.mnemonic ?? '',
          tags: d.tags ?? [],
          langFront: null,
          langBack: null,
          suspended: false,
          trouble: false,
        }));
        await repo.saveCards(cards);
        return id;
      });
      onCreated(valid.length, destination);
    } catch (err) {
      console.error('Failed to import cards', err);
      setSaving(false);
      setSaveError(err instanceof StorageFullError ? strings.csv.storageFull : strings.csv.createFailed);
    }
  }

  return (
    <Dialog title={strings.csv.title} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="block rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm font-medium dark:border-slate-700"
        >
          <span className="block">{strings.csv.file}</span>
          <span className="block font-normal text-slate-600 dark:text-slate-400">{strings.csv.dropHint}</span>
          <input
            ref={fileRef}
            aria-label={strings.csv.file}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={(e) => void load(e.target.files?.[0])}
            className="mt-2 block w-full min-h-11 text-sm"
          />
        </label>
        {fileError && (
          <p role="alert" className="text-sm text-rose-600">
            {fileError}
          </p>
        )}
        <label className="block text-sm font-medium">
          {strings.csv.targetDeck}
          <select value={target} onChange={(e) => setChoice(e.target.value)} className={fieldClass}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{`${d.emoji} ${d.name}`}</option>
            ))}
            <option value={NEW_DECK}>{strings.csv.newDeckOption}</option>
          </select>
        </label>
        {target === NEW_DECK && (
          <>
            <label className="block text-sm font-medium">
              {strings.csv.newDeckName}
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNameError(false);
                }}
                aria-invalid={nameError}
                aria-describedby={nameError ? nameErrorId : undefined}
                className={fieldClass}
              />
            </label>
            {nameError && (
              <p id={nameErrorId} role="alert" className="text-sm text-rose-600">
                {strings.csv.nameRequired}
              </p>
            )}
          </>
        )}

        {parsed && (
          <>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="text-sm font-medium">{strings.csv.mapping}</legend>
              {mapping.map((field, i) => (
                <label key={i} className="block text-sm font-medium">
                  {strings.csv.column(i + 1, parsed.headers?.[i] ?? null)}
                  <select
                    value={field}
                    onChange={(e) => setMapping(mapping.map((f, j) => (j === i ? (e.target.value as CsvField) : f)))}
                    className={fieldClass}
                  >
                    {FIELDS.map((f) => (
                      <option key={f} value={f}>{strings.csv.fields[f]}</option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
            {valid.length > 0 && (
              <div>
                <table aria-label={strings.csv.preview} className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr>
                      {(['front', 'back', 'tags', 'type'] as const).map((f) => (
                        <th key={f} scope="col" className="p-1 text-start">{strings.csv.fields[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((d, i) => (
                      <tr key={i} className="border-t border-slate-200 align-top dark:border-slate-700">
                        <td dir="auto" className="whitespace-pre-wrap break-words p-1">{d.front}</td>
                        <td dir="auto" className="whitespace-pre-wrap break-words p-1">{d.back}</td>
                        <td dir="auto" className="break-words p-1">{d.tags?.join(' ')}</td>
                        <td className="p-1">{d.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {valid.length > PREVIEW_LIMIT && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{strings.csv.more(valid.length - PREVIEW_LIMIT)}</p>
                )}
              </div>
            )}
            {skipped > 0 && (
              <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {strings.csv.skippedWarning(skipped)}
              </div>
            )}
          </>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-rose-600">
            {saveError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
            {strings.common.cancel}
          </button>
          <button
            type="submit"
            disabled={valid.length === 0 || saving}
            className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {strings.csv.create(valid.length)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
