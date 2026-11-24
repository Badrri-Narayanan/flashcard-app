import { strings } from '../strings';
import { canSpeak, speak } from './speech';

interface Props {
  text: string;
  lang: string;
}

export default function SpeakButton({ text, lang }: Props) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      aria-label={strings.speech.speak}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, lang);
      }}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-slate-200 dark:hover:bg-slate-800"
    >
      <span aria-hidden>🔊</span>
    </button>
  );
}
