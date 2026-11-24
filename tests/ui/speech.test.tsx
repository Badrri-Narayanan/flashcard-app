import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import { DEFAULT_SETTINGS, SettingsContext, type AppSettings } from '../../src/ui/settings/settings';
import { routes } from '../../src/ui/routes';
import PronounceButton from '../../src/ui/speech/PronounceButton';
import SpeakButton from '../../src/ui/speech/SpeakButton';
import { canListen, canSpeak, listenOnce, speak } from '../../src/ui/speech/speech';

interface FakeUtterance {
  text: string;
  lang: string;
  voice: { lang: string; name: string } | null;
}

const spoken: FakeUtterance[] = [];
const cancel = vi.fn();
const voices = [
  { lang: 'en-US', name: 'Alex' },
  { lang: 'es-MX', name: 'Paulina' },
];

function installSynthesis() {
  spoken.length = 0;
  cancel.mockClear();
  class Utterance {
    text: string;
    lang = '';
    voice: FakeUtterance['voice'] = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (u: FakeUtterance) => spoken.push(u), cancel, getVoices: () => voices },
  });
}

function removeSynthesis() {
  vi.unstubAllGlobals();
  // @ts-expect-error test cleanup
  delete window.speechSynthesis;
}

type Behaviour = (r: FakeRecognition) => void;
let recognitions: FakeRecognition[] = [];
class FakeRecognition {
  static behaviour: Behaviour = () => undefined;
  lang = '';
  interimResults = true;
  maxAlternatives = 5;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  aborted = false;
  constructor() {
    recognitions.push(this);
  }
  start() {
    FakeRecognition.behaviour(this);
  }
  abort() {
    this.aborted = true;
  }
  say(transcript: string) {
    this.onresult?.({ results: [[{ transcript }]] });
    this.onend?.();
  }
}

function installRecognition(behaviour: Behaviour) {
  recognitions = [];
  FakeRecognition.behaviour = behaviour;
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
}

function removeRecognition() {
  // @ts-expect-error test cleanup
  delete window.SpeechRecognition;
}

afterEach(() => {
  cleanup();
  removeSynthesis();
  removeRecognition();
  vi.useRealTimers();
});

describe('speak', () => {
  beforeEach(installSynthesis);

  it('strips markdown, cancels the current utterance and sets lang and a matching voice', () => {
    speak('**Hola** [mundo](http://x.test)', 'es-ES');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('Hola mundo');
    expect(spoken[0].lang).toBe('es-ES');
    expect(spoken[0].voice?.name).toBe('Paulina');
  });

  it('reads fenced and inline code as the word "code"', () => {
    speak('Use `map()` here\n```ts\nconst x = 1;\n```\nthen stop', 'en');
    expect(spoken[0].text).toBe('Use code here code then stop');
  });

  it('leaves lang and voice at the browser default for an empty lang', () => {
    speak('hello', '');
    expect(spoken[0].lang).toBe('');
    expect(spoken[0].voice).toBeNull();
  });

  it('says nothing for text that is empty once stripped', () => {
    speak('  ', 'en');
    expect(spoken).toHaveLength(0);
  });
});

describe('support detection', () => {
  it('buttons render nothing when unsupported', () => {
    expect(canSpeak()).toBe(false);
    expect(canListen()).toBe(false);
    const { container } = render(
      <>
        <SpeakButton text="hi" lang="en" />
        <PronounceButton target="hi" lang="en" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('detects the prefixed recognition constructor', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeRecognition });
    expect(canListen()).toBe(true);
    // @ts-expect-error test cleanup
    delete window.webkitSpeechRecognition;
  });
});

describe('listenOnce', () => {
  it('resolves with the transcript', async () => {
    installRecognition((r) => r.say('hola'));
    await expect(listenOnce('es-ES')).resolves.toBe('hola');
    expect(recognitions[0].lang).toBe('es-ES');
  });

  it('rejects on a recognition error', async () => {
    installRecognition((r) => r.onerror?.({ error: 'not-allowed' }));
    await expect(listenOnce('es')).rejects.toThrow('not-allowed');
  });

  it('rejects when recognition ends without a result', async () => {
    installRecognition((r) => r.onend?.());
    await expect(listenOnce('es')).rejects.toThrow();
  });

  it('rejects and aborts on timeout', async () => {
    vi.useFakeTimers();
    installRecognition(() => undefined);
    const p = listenOnce('es', 1000);
    const assertion = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(recognitions[0].aborted).toBe(true);
  });
});

describe('PronounceButton', () => {
  it("shows 'Almost' with the transcript for a close match", async () => {
    installRecognition((r) => r.say('beautifull'));
    const user = userEvent.setup();
    render(<PronounceButton target="beautiful" lang="en-US" />);
    await user.click(screen.getByRole('button', { name: 'Check pronunciation' }));
    expect(await screen.findByText('Almost')).toBeInTheDocument();
    expect(screen.getByText(/beautifull/)).toBeInTheDocument();
  });

  it('shows Exact and Not quite verdicts', async () => {
    installRecognition((r) => r.say('Hola!'));
    const user = userEvent.setup();
    const { rerender } = render(<PronounceButton target="**hola**" lang="es" />);
    await user.click(screen.getByRole('button', { name: 'Check pronunciation' }));
    expect(await screen.findByText('Exact')).toBeInTheDocument();
    rerender(<PronounceButton target="completely different" lang="es" />);
    await user.click(screen.getByRole('button', { name: 'Check pronunciation' }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
  });

  it('shows a friendly message instead of crashing when recognition fails', async () => {
    installRecognition((r) => r.onerror?.({ error: 'no-speech' }));
    const user = userEvent.setup();
    render(<PronounceButton target="hola" lang="es" />);
    await user.click(screen.getByRole('button', { name: 'Check pronunciation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t hear/i);
  });

  it('aborts recognition on unmount', async () => {
    installRecognition(() => undefined);
    const user = userEvent.setup();
    const { unmount } = render(<PronounceButton target="hola" lang="es" />);
    await user.click(screen.getByRole('button', { name: 'Check pronunciation' }));
    unmount();
    expect(recognitions[0].aborted).toBe(true);
  });
});

describe('SpeakButton', () => {
  it('speaks its text when pressed', async () => {
    installSynthesis();
    const user = userEvent.setup();
    render(<SpeakButton text="**hi**" lang="en" />);
    await user.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(spoken[0].text).toBe('hi');
  });
});

function mkDeck(): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'Spanish', description: '', color: '#6366f1', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS, confidencePrompt: false, langFront: 'en-US', langBack: 'es-ES' },
    sourceId: null, matchBestMs: null,
  };
}

async function seedOne() {
  const deck = mkDeck();
  await repo.saveDeck(deck);
  const card: Card = {
    ...baseRecord(), deckId: deck.id, type: 'basic', front: 'the question', back: 'la respuesta', distractors: [],
    mnemonic: '', tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
  };
  await repo.saveCard(card);
  return deck;
}

function renderAt(path: string, settings: Partial<AppSettings> = {}) {
  const value: [AppSettings, () => void] = [{ ...DEFAULT_SETTINGS, flipAnimation: false, ...settings }, () => undefined];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SettingsContext.Provider value={value}>
      <RouterProvider router={router} />
    </SettingsContext.Provider>,
  );
}

describe.each(['learn', 'cram'])('%s mode speech', (mode) => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    installSynthesis();
    installRecognition(() => undefined);
  });

  it('the s key speaks the visible side: front before reveal, last back part after', async () => {
    const user = userEvent.setup();
    const deck = await seedOne();
    renderAt(`/study/deck/${deck.id}/${mode}`);
    await screen.findByText('the question');

    await user.keyboard('s');
    expect(spoken[spoken.length - 1]).toMatchObject({ text: 'the question', lang: 'en-US' });

    await user.keyboard(' ');
    await screen.findByText('la respuesta');
    await user.keyboard('s');
    expect(spoken[spoken.length - 1]).toMatchObject({ text: 'la respuesta', lang: 'es-ES' });
  });

  it('offers a speak button per part and pronounce only on revealed parts', async () => {
    const user = userEvent.setup();
    const deck = await seedOne();
    renderAt(`/study/deck/${deck.id}/${mode}`);
    await screen.findByText('the question');
    expect(screen.getAllByRole('button', { name: 'Read aloud' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Check pronunciation' })).not.toBeInTheDocument();

    await user.keyboard(' ');
    await screen.findByText('la respuesta');
    expect(screen.getAllByRole('button', { name: 'Read aloud' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Check pronunciation' })).toHaveLength(2);
    expect(await repo.listLogs()).toHaveLength(0);
  });

  it('does not speak on reveal unless autoReadAloud is on', async () => {
    const user = userEvent.setup();
    const deck = await seedOne();
    renderAt(`/study/deck/${deck.id}/${mode}`);
    await screen.findByText('the question');
    await user.keyboard(' ');
    await screen.findByText('la respuesta');
    expect(spoken).toHaveLength(0);
  });

  it('autoReadAloud speaks the last back part when revealed', async () => {
    const user = userEvent.setup();
    const deck = await seedOne();
    renderAt(`/study/deck/${deck.id}/${mode}`, { autoReadAloud: true });
    await screen.findByText('the question');
    expect(spoken).toHaveLength(0);
    await user.keyboard(' ');
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ text: 'la respuesta', lang: 'es-ES' });
  });

  it('cancels speech when leaving the session', async () => {
    const deck = await seedOne();
    const value: [AppSettings, () => void] = [{ ...DEFAULT_SETTINGS, flipAnimation: false }, () => undefined];
    const router = createMemoryRouter(routes, { initialEntries: [`/study/deck/${deck.id}/${mode}`] });
    render(
      <SettingsContext.Provider value={value}>
        <RouterProvider router={router} />
      </SettingsContext.Provider>,
    );
    await screen.findByText('the question');
    cancel.mockClear();
    await act(async () => {
      await router.navigate('/');
    });
    expect(cancel).toHaveBeenCalled();
  });
});

describe('type and quiz prompts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    installSynthesis();
  });

  it('type mode prompt has a speak button using the question language', async () => {
    const user = userEvent.setup();
    const deck = await seedOne();
    renderAt(`/study/deck/${deck.id}/type`);
    await screen.findByText('the question');
    await user.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(spoken[0]).toMatchObject({ text: 'the question', lang: 'en-US' });
  });
});
