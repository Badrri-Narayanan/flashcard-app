import Dialog from '../components/Dialog';
import { strings } from '../strings';

interface Props {
  mode: 'learn' | 'cram' | 'quiz' | 'type' | 'match';
  onClose(): void;
}

export default function KeyboardHelp({ mode, onClose }: Props) {
  const k = strings.study.keys;
  const help = ['?', k.help];
  const rowsByMode: Record<Props['mode'], string[][]> = {
    learn: [['Space', k.flip], ['1 2 3 4', k.rate], ['Z', k.undo], help],
    cram: [['Space', k.flip], ['1 / 3', k.cramMark], ['← →', k.cramNav], help],
    quiz: [['1 2 3 4', k.quizPick], ['Enter / Space', k.quizNext], help],
    type: [['Enter', k.typeCheck], ['R', k.typeOverride], help],
    match: [['Tab', k.matchMove], ['Enter / Space', k.matchSelect], help],
  };
  const rows = rowsByMode[mode];
  return (
    <Dialog title={k.title} onClose={onClose}>
      <dl className="space-y-2">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <dt>
              <kbd className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800">
                {key}
              </kbd>
            </dt>
            <dd className="text-sm">{label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
