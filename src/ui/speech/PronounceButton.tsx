import { useEffect, useRef, useState } from 'react';
import { matchAnswer, stripMarkdown } from '../../domain/matcher';
import { strings } from '../strings';
import { canListen, listenOnce } from './speech';

interface Props {
  target: string;
  lang: string;
}

type Outcome =
  | { phase: 'listening' }
  | { phase: 'result'; verdict: 'exact' | 'close' | 'wrong'; transcript: string }
  | { phase: 'failed' };

/** An outcome belongs to the target it was heard for; a different target shows the idle button again. */
type State = { phase: 'idle' } | (Outcome & { forKey: string });

export default function PronounceButton({ target, lang }: Props) {
  const [recorded, setState] = useState<State>({ phase: 'idle' });
  const key = `${lang}\n${target}`;
  const state: State = recorded.phase !== 'idle' && recorded.forKey !== key ? { phase: 'idle' } : recorded;
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), [key]);

  if (!canListen()) return null;
  const t = strings.speech;
  const listening = state.phase === 'listening';

  const start = async () => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setState({ phase: 'listening', forKey: key });
    try {
      const transcript = await listenOnce(lang, undefined, mine.signal);
      if (mine.signal.aborted) return;
      setState({ phase: 'result', forKey: key, verdict: matchAnswer(transcript, stripMarkdown(target)).verdict, transcript });
    } catch {
      if (!mine.signal.aborted) setState({ phase: 'failed', forKey: key });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={listening}
        aria-label={listening ? t.listening : t.pronounce}
        onClick={(e) => {
          e.stopPropagation();
          void start();
        }}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-slate-200 disabled:opacity-60 dark:hover:bg-slate-800"
      >
        <span aria-hidden>🎤</span>
      </button>
      {state.phase === 'result' && (
        <p role="status" className="text-sm">
          <span className="font-medium">{t.verdict[state.verdict]}</span>
          <span className="text-slate-600 dark:text-slate-400"> · {t.heard(state.transcript)}</span>
        </p>
      )}
      {state.phase === 'failed' && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t.failed}</p>
      )}
    </div>
  );
}
