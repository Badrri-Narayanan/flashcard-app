import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CardType } from '../../domain/types';
import CardContent from '../components/CardContent';
import { strings } from '../strings';
import ConfirmDialog from './ConfirmDialog';
import DistractorList from './DistractorList';
import { previewFront } from './editorLogic';
import ImageButton from './ImageButton';
import LanguageSelect from './LanguageSelect';
import MarkdownField from './MarkdownField';
import TagInput from './TagInput';
import { useCardEditor } from './useCardEditor';

const TYPES: CardType[] = ['basic', 'reversible', 'cloze', 'mcq'];
const btn = 'min-h-11 rounded-lg px-4 font-medium';
const secondary = `${btn} border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800`;

export default function CardEditor() {
  const { id = '', cardId } = useParams();
  const ed = useCardEditor(id, cardId);
  const { form, refs, lastField } = ed;
  const [opened, setOpened] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (ed.state === 'ready') refs.front.current?.focus();
    // Focus the front field once the editor is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.state]);

  if (ed.state === 'loading') return <p className="px-4 py-8">{strings.common.loading}</p>;
  if (ed.state === 'missing') {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <p>{strings.editor.notFound}</p>
        <Link to="/" className={`${btn} mt-4 inline-flex items-center bg-accent-600 text-white`}>{strings.common.goHome}</Link>
      </section>
    );
  }

  const cloze = form.type === 'cloze';
  const mcq = form.type === 'mcq';
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void ed.submit(true);
    }
  };
  const field = (f: 'front' | 'back') => ({
    ref: refs[f],
    onFocus: () => (lastField.current = f),
    onImages: (files: File[]) => void ed.addImages(f, files),
  });

  return (
    <form onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown} noValidate className="mx-auto max-w-5xl space-y-4 px-4 py-4">
      <h1 className="text-2xl font-bold">{ed.existing ? strings.editor.editCard : strings.editor.newCard}</h1>

      <div role="tablist" aria-label={strings.editor.previewTabs} className="flex gap-2 md:hidden">
        {(['edit', 'preview'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`${btn} flex-1 ${tab === t ? 'bg-accent-600 text-white' : secondary}`}>
            {t === 'edit' ? strings.editor.edit : strings.editor.preview}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={`space-y-4 ${tab === 'preview' ? 'hidden md:block' : ''}`}>
          <label className="block text-sm font-medium">
            {strings.editor.type}
            <select value={form.type} onChange={(e) => ed.patch({ type: e.target.value as CardType })}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-800">
              {TYPES.map((t) => <option key={t} value={t}>{strings.editor.types[t]}</option>)}
            </select>
          </label>

          <MarkdownField label={cloze ? strings.editor.clozeText : mcq ? strings.editor.question : strings.editor.front}
            value={form.front} required onChange={(front) => ed.patch({ front })} {...field('front')} />
          <div className="flex flex-wrap gap-2">
            {cloze && <button type="button" onClick={ed.makeBlank} className={secondary}>{strings.editor.makeBlank}</button>}
            <ImageButton onPick={(file) => void ed.addImages(lastField.current, [file])} />
          </div>

          <MarkdownField label={cloze ? strings.editor.clozeExtra : mcq ? strings.editor.correctAnswer : strings.editor.back}
            value={form.back} rows={3} onChange={(back) => ed.patch({ back })} {...field('back')} />
          {mcq && <DistractorList values={form.distractors} onChange={(distractors) => ed.patch({ distractors })} />}

          <details open={opened ?? form.mnemonic !== ''} onToggle={(e) => setOpened(e.currentTarget.open)}>
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{strings.editor.mnemonic}</summary>
            <label className="block text-sm font-medium">
              {strings.editor.mnemonicLabel}
              <textarea value={form.mnemonic} rows={2} onChange={(e) => ed.patch({ mnemonic: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
            </label>
          </details>

          <TagInput tags={form.tags} draft={ed.tagDraft} onDraftChange={ed.setTagDraft} onChange={(tags) => ed.patch({ tags })} />
          <div className="grid grid-cols-2 gap-3">
            <LanguageSelect label={strings.editor.langFront} value={form.langFront} onChange={(langFront) => ed.patch({ langFront })} />
            <LanguageSelect label={strings.editor.langBack} value={form.langBack} onChange={(langBack) => ed.patch({ langBack })} />
          </div>
        </div>

        <section aria-label={strings.editor.preview} className={`space-y-3 ${tab === 'edit' ? 'hidden md:block' : ''}`}>
          <h2 className="text-sm font-medium">{strings.editor.preview}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <CardContent markdown={previewFront(form)} lang={form.langFront} />
          </div>
          {form.back.trim() && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <CardContent markdown={form.back} lang={form.langBack} />
            </div>
          )}
        </section>
      </div>

      <div aria-live="polite">
        {ed.errors.map((m) => <p key={m} role="alert" className="text-sm text-rose-600">{m}</p>)}
        {ed.saveError && <p role="alert" className="text-sm text-rose-600">{strings.editor.saveFailed}</p>}
        {ed.imageError && <p role="alert" className="text-sm text-rose-600">{strings.editor.imageFailed}</p>}
        {ed.saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{strings.editor.saved}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={ed.cancel} className={`${btn} hover:bg-slate-100 dark:hover:bg-slate-800`}>{strings.common.cancel}</button>
        <button type="button" disabled={ed.saving} onClick={() => void ed.submit(false)} className={secondary}>{strings.common.save}</button>
        <span className="hidden self-center text-xs text-slate-600 md:inline dark:text-slate-400">{strings.editor.shortcutHint}</span>
        <button type="button" disabled={ed.saving} onClick={() => void ed.submit(true)}
          className={`${btn} bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-60`}>{strings.editor.saveAndAdd}</button>
      </div>

      {ed.confirmAdd !== null && (
        <ConfirmDialog title={strings.editor.typeChangeTitle} body={strings.editor.typeChangeWarning}
          confirmLabel={strings.editor.typeChangeConfirm} onConfirm={() => void ed.confirmTypeChange()} onCancel={ed.cancelTypeChange} />
      )}
      {ed.confirmDiscard && (
        <ConfirmDialog title={strings.editor.discardTitle} body={strings.editor.discardBody} confirmLabel={strings.editor.discardConfirm}
          cancelLabel={strings.editor.keepEditing} onConfirm={ed.goBack} onCancel={ed.dismissDiscard} />
      )}
    </form>
  );
}
