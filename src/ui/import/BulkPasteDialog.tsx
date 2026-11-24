import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { newDeckSettings } from '../settings/newDeckSettings';
import { detectSeparators, parseBulk, type CardSep, type TermSep } from '../../domain/bulkPaste';
import { baseRecord } from '../../domain/ids';
import { type Card, type Deck, type Id } from '../../domain/types';
import Dialog from '../components/Dialog';
import { UNDO_TOAST_MS } from '../components/toastTiming';
import { strings } from '../strings';

interface Props {
  open: boolean;
  onClose: () => void;
  deckId?: Id;
  initialText?: string;
}

const NEW_DECK = '__new__';
const CUSTOM = 'custom';
const PREVIEW_LIMIT = 50;
const DETECT_DEBOUNCE_MS = 200;
const TERM_KEYS = [' - ', '\t', ':', ';', ','] as const;

const fieldClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800';

function termKey(sep: TermSep): string {
  return typeof sep === 'string' ? sep : CUSTOM;
}

export default function BulkPasteDialog({ open, onClose, deckId, initialText }: Props) {
  const [created, setCreated] = useState<{ count: number; deckId: Id } | null>(null);

  useEffect(() => {
    if (!created) return;
    const t = setTimeout(() => setCreated(null), UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [created]);

  return (
    <>
      {open && (
        <BulkPasteLoader
          deckId={deckId}
          initialText={initialText}
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
            <span>{strings.bulk.created(created.count)}</span>
            <Link to={`/deck/${created.deckId}`} className="inline-flex min-h-11 items-center px-3 font-semibold text-accent-500 hover:underline">
              {strings.bulk.viewDeck}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function BulkPasteLoader(props: Omit<FormProps, 'decks'>) {
  const decks = useLiveQuery(() => repo.listDecks(), []);
  return decks ? <BulkPasteForm {...props} decks={decks} /> : null;
}

interface FormProps {
  decks: Deck[];
  deckId?: Id;
  initialText?: string;
  onClose: () => void;
  onCreated: (count: number, deckId: Id) => void;
}

function BulkPasteForm({ decks, deckId, initialText, onClose, onCreated }: FormProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [text, setText] = useState(initialText ?? '');
  const [termSel, setTermSel] = useState<string>(' - ');
  const [customSep, setCustomSep] = useState('');
  const [card, setCard] = useState<CardSep>('newline');
  const [manual, setManual] = useState(false);
  const [type, setType] = useState<'basic' | 'reversible'>('basic');
  const [swap, setSwap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const nameErrorId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Runs after Dialog's own effect has opened the modal; focus() inside a closed <dialog> is a no-op.
  useEffect(() => {
    textRef.current?.focus();
  }, []);

  const target = choice ?? (deckId && decks.some((d) => d.id === deckId) ? deckId : (decks[0]?.id ?? NEW_DECK));

  useEffect(() => {
    if (manual || text.trim() === '') return;
    const t = setTimeout(() => {
      const detected = detectSeparators(text);
      setTermSel(termKey(detected.term));
      setCard(detected.card);
    }, DETECT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, manual]);

  const { drafts, skipped } = useMemo(() => {
    const term: TermSep = termSel === CUSTOM ? { custom: customSep } : (termSel as TermSep);
    return parseBulk(text, { term, card });
  }, [text, termSel, customSep, card]);
  const rows = drafts.slice(0, PREVIEW_LIMIT);
  const view = (d: { front: string; back: string }) => (swap ? { front: d.back, back: d.front } : d);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (drafts.length === 0 || saving) return;
    if (target === NEW_DECK && !newName.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
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
            color: '',
            emoji: '📚',
            order: 0,
            settings: await newDeckSettings(),
            sourceId: null,
            matchBestMs: null,
          });
        }
        const cards: Card[] = drafts.map((d) => ({
          ...baseRecord(),
          ...view(d),
          deckId: id,
          type,
          distractors: [],
          mnemonic: '',
          tags: [],
          langFront: null,
          langBack: null,
          suspended: false,
          trouble: false,
        }));
        await repo.saveCards(cards);
        return id;
      });
      onCreated(drafts.length, destination);
    } catch (err) {
      console.error('Failed to create cards', err);
      setSaving(false);
      setSaveError(true);
    }
  }

  const selectClass = fieldClass;
  return (
    <Dialog title={strings.bulk.title} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block text-sm font-medium">
          {strings.bulk.targetDeck}
          <select value={target} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{`${d.emoji} ${d.name}`}</option>
            ))}
            <option value={NEW_DECK}>{strings.bulk.newDeckOption}</option>
          </select>
        </label>
        {target === NEW_DECK && (
          <>
            <label className="block text-sm font-medium">
              {strings.bulk.newDeckName}
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
              <p id={nameErrorId} role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {strings.bulk.nameRequired}
              </p>
            )}
          </>
        )}
        <label className="block text-sm font-medium">
          {strings.bulk.textLabel}
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={strings.bulk.placeholder}
            className={`${fieldClass} font-mono text-sm`}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {strings.bulk.termSep}
            <select
              value={termSel}
              onChange={(e) => {
                setManual(true);
                setTermSel(e.target.value);
              }}
              className={selectClass}
            >
              {TERM_KEYS.map((k) => (
                <option key={k} value={k}>{strings.bulk.termSeps[k]}</option>
              ))}
              <option value={CUSTOM}>{strings.bulk.termSeps.custom}</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            {strings.bulk.cardSep}
            <select
              value={card}
              onChange={(e) => {
                setManual(true);
                setCard(e.target.value as CardSep);
              }}
              className={selectClass}
            >
              <option value="newline">{strings.bulk.cardSeps.newline}</option>
              <option value="blankline">{strings.bulk.cardSeps.blankline}</option>
            </select>
          </label>
        </div>
        {termSel === CUSTOM && (
          <label className="block text-sm font-medium">
            {strings.bulk.customSep}
            <input value={customSep} onChange={(e) => setCustomSep(e.target.value)} className={fieldClass} />
          </label>
        )}
        <div role="radiogroup" aria-label={strings.bulk.cardType} className="flex flex-wrap items-center gap-4">
          {(['basic', 'reversible'] as const).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 text-sm font-medium">
              <input type="radio" name="bulk-type" checked={type === t} onChange={() => setType(t)} />
              {strings.editor.types[t]}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} />
            {strings.bulk.swap}
          </label>
        </div>

        {drafts.length > 0 && (
          <div>
            <table aria-label={strings.bulk.preview} className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="text-start">
                  <th scope="col" className="p-1 text-start">{strings.bulk.front}</th>
                  <th scope="col" className="p-1 text-start">{strings.bulk.back}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const v = view(d);
                  return (
                    <tr key={i} className="border-t border-slate-200 align-top dark:border-slate-700">
                      <td dir="auto" className="whitespace-pre-wrap break-words p-1">{v.front}</td>
                      <td dir="auto" className="whitespace-pre-wrap break-words p-1">{v.back}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {drafts.length > PREVIEW_LIMIT && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{strings.bulk.more(drafts.length - PREVIEW_LIMIT)}</p>
            )}
          </div>
        )}
        {skipped.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">{strings.bulk.skippedTitle(skipped.length)}</p>
            <ul className="mt-1 list-disc ps-5">
              {skipped.map((n) => (
                <li key={n}>{strings.bulk.skippedLine(n)}</li>
              ))}
            </ul>
          </div>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {strings.bulk.createFailed}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
            {strings.common.cancel}
          </button>
          <button
            type="submit"
            disabled={drafts.length === 0 || saving}
            className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {strings.bulk.create(drafts.length)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
