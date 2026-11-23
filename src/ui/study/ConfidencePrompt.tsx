import type { Confidence } from '../../domain/types';
import { strings } from '../strings';

interface Props {
  onChoose(c: Confidence): void;
}

const CHOICES: Confidence[] = ['unsure', 'think', 'sure'];

export default function ConfidencePrompt({ onChoose }: Props) {
  return (
    <div role="group" aria-label={strings.study.confidenceLabel} className="space-y-2">
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{strings.study.confidenceLabel}</p>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChoose(c)}
            className="min-h-12 rounded-xl border border-slate-300 bg-white font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            {strings.study.confidence[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
