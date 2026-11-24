import { stripMarkdown } from '../../domain/matcher';

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function canListen(): boolean {
  return recognitionCtor() !== undefined;
}

/** Text as it should be read: code is not spelled out, Markdown marks are dropped. */
function spokenText(markdown: string): string {
  return stripMarkdown(markdown.replace(/```[\s\S]*?```/g, ' code ').replace(/`[^`\n]*`/g, 'code'));
}

function primarySubtag(lang: string): string {
  return lang.toLowerCase().split('-')[0];
}

export function cancelSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speak(markdown: string, lang: string): void {
  if (!canSpeak()) return;
  const text = spokenText(markdown);
  window.speechSynthesis.cancel();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) {
    utterance.lang = lang;
    const primary = primarySubtag(lang);
    const voice = window.speechSynthesis.getVoices().find((v) => primarySubtag(v.lang) === primary);
    if (voice) utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
}

/** Listens for one phrase. Rejects on error, timeout, no result, or when `signal` aborts. */
export function listenOnce(lang: string, timeoutMs = 6000, signal?: AbortSignal): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error('unsupported'));
  return new Promise<string>((resolve, reject) => {
    const recognition = new Ctor();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const stop = (error: Error) => {
      finish(() => {
        recognition.abort();
        reject(error);
      });
    };
    const onAbort = () => stop(new Error('aborted'));
    const timer = setTimeout(() => stop(new Error('timeout')), timeoutMs);
    if (lang) recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript.trim();
      if (transcript) finish(() => resolve(transcript));
    };
    recognition.onerror = (e) => finish(() => reject(new Error(e.error)));
    recognition.onend = () => finish(() => reject(new Error('no-result')));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort);
    try {
      recognition.start();
    } catch (err) {
      stop(err instanceof Error ? err : new Error('start-failed'));
    }
  });
}
