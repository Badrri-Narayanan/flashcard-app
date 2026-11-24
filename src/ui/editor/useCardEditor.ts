import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeImage } from '../../data/media';
import { repo } from '../../data/repo';
import { baseRecord } from '../../domain/ids';
import type { Card, Id } from '../../domain/types';
import { useStorageErrors } from '../components/storageError';
import { strings } from '../strings';
import { EMPTY_FORM, insertAt, mergeTags, validate, wrapBlank, type EditorForm } from './editorLogic';

export type Field = 'front' | 'back';
export type FocusField = Field | 'mnemonic';
export type LoadState = 'loading' | 'ready' | 'missing';

const formOf = (c: Card): EditorForm => ({
  type: c.type,
  front: c.front,
  back: c.back,
  distractors: c.distractors.length > 0 ? c.distractors : [''],
  mnemonic: c.mnemonic,
  tags: c.tags,
  langFront: c.langFront,
  langBack: c.langBack,
});

/** State and actions for the card editor screen (new card when cardId is undefined). */
export function useCardEditor(deckId: Id, cardId: Id | undefined) {
  const navigate = useNavigate();
  const { reportStorageError } = useStorageErrors();
  const [state, setState] = useState<LoadState>('loading');
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<EditorForm>(EMPTY_FORM);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [existing, setExisting] = useState<Card | undefined>();
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmAdd, setConfirmAdd] = useState<boolean | null>(null);
  const refs = { front: useRef<HTMLTextAreaElement>(null), back: useRef<HTMLTextAreaElement>(null) };
  const mnemonicRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<Field>('front');
  const loadedId = useRef<Id | undefined>(undefined);
  const caret = useRef<{ field: Field; pos: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const deck = await repo.getDeck(deckId);
      if (cancelled) return;
      if (!deck || deck.deletedAt !== null) return setState('missing');
      if (cardId && loadedId.current !== cardId) {
        const card = await repo.getCard(cardId);
        if (cancelled) return;
        if (!card || card.deletedAt !== null || card.deckId !== deckId) return setState('missing');
        loadedId.current = cardId;
        setExisting(card);
        setForm(formOf(card));
        setBaseline(formOf(card));
      }
      setState('ready');
    })().catch((err: unknown) => {
      console.error('Failed to load card', err);
      if (!cancelled) setState('missing');
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, cardId]);

  useLayoutEffect(() => {
    if (!caret.current) return;
    const { field, pos } = caret.current;
    caret.current = null;
    const el = refs[field].current;
    el?.focus();
    el?.setSelectionRange(pos, pos);
  });

  const patch = useCallback((p: Partial<EditorForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors([]);
    setSaved(false);
  }, []);

  const goBack = useCallback(() => navigate(`/deck/${deckId}`), [navigate, deckId]);
  const dirty = tagDraft.trim() !== '' || JSON.stringify(form) !== JSON.stringify(baseline);
  const cancel = () => (dirty ? setConfirmDiscard(true) : goBack());

  async function persist(addAnother: boolean) {
    setSaving(true);
    setSaveError(false);
    const fields = {
      type: form.type,
      front: form.front.trim(),
      back: form.back.trim(),
      distractors: form.type === 'mcq' ? form.distractors.map((d) => d.trim()).filter(Boolean) : [],
      mnemonic: form.mnemonic.trim(),
      tags: mergeTags(form.tags, tagDraft),
      langFront: form.langFront,
      langBack: form.langBack,
    };
    const card: Card = existing
      ? { ...existing, ...fields }
      : { ...baseRecord(), deckId, suspended: false, trouble: false, ...fields };
    try {
      await repo.saveCard(card);
    } catch (err) {
      console.error('Failed to save card', err);
      reportStorageError(err);
      setSaveError(true);
      setSaving(false);
      return;
    }
    if (!addAnother) return goBack();
    const next: EditorForm = { ...EMPTY_FORM, type: fields.type, tags: fields.tags, langFront: fields.langFront, langBack: fields.langBack };
    setForm(next);
    setBaseline(next);
    setTagDraft('');
    setExisting(undefined);
    setSaved(true);
    setSaving(false);
    if (cardId) navigate(`/deck/${deckId}/edit`, { replace: true });
    caret.current = { field: 'front', pos: 0 };
  }

  async function submit(addAnother: boolean) {
    if (saving) return;
    const problems = validate(form);
    setErrors(problems);
    if (problems.length > 0) return;
    if (existing && existing.type !== form.type) {
      try {
        const items = await repo.getReviewItemsForCard(existing.id);
        if (items.some((i) => i.reps > 0)) return setConfirmAdd(addAnother);
      } catch (err) {
        console.error('Failed to check progress', err);
        return setSaveError(true);
      }
    }
    await persist(addAnother);
  }

  async function confirmTypeChange() {
    const addAnother = confirmAdd ?? false;
    setConfirmAdd(null);
    await persist(addAnother);
  }

  function makeBlank() {
    const el = refs.front.current;
    const out = el && wrapBlank(form.front, el.selectionStart, el.selectionEnd);
    if (!out) return;
    caret.current = { field: 'front', pos: out.caret };
    patch({ front: out.text });
  }

  async function addImages(field: Field, files: File[]) {
    setImageError(false);
    try {
      for (const file of files) {
        const md = `![${strings.editor.imageAlt}](${await storeImage(file)})`;
        const el = refs[field].current;
        const value = el?.value ?? form[field];
        const out = insertAt(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, md);
        caret.current = { field, pos: out.caret };
        patch({ [field]: out.text });
      }
    } catch (err) {
      console.error('Failed to add image', err);
      setImageError(true);
    }
  }

  return {
    tagDraft, setTagDraft, dirty, cancel, confirmDiscard, dismissDiscard: () => setConfirmDiscard(false),
    state, form, existing, errors, saveError, imageError, saving, saved, confirmAdd,
    refs, mnemonicRef, lastField, patch, goBack, submit, confirmTypeChange, cancelTypeChange: () => setConfirmAdd(null), makeBlank, addImages,
  };
}
