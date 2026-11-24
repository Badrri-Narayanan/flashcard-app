import { DEFAULT_DECK_SETTINGS, type Card, type CardType, type Deck, type Folder, type Id } from '../domain/types';
import { repo } from './repo';

/** Fixed, UUID-shaped ids so reseeding finds the same records every time. */
const sampleId = (kind: number, n: number): Id =>
  `5a3b1e00-0000-4000-8000-${String(kind).padStart(4, '0')}${String(n).padStart(8, '0')}`;

export const SAMPLE_FOLDER_ID = sampleId(1, 0);
const JS_DECK_ID = sampleId(2, 1);
const ES_DECK_ID = sampleId(2, 2);
const CAPITALS_DECK_ID = sampleId(2, 3);

interface SampleCard {
  type: CardType;
  front: string;
  back: string;
  distractors?: string[];
}

const fence = (code: string) => '```js\n' + code + '\n```';

const JS_CARDS: SampleCard[] = [
  { type: 'basic', front: 'Which keyword declares a variable that cannot be reassigned?', back: '`const`. The binding is fixed, though an object it points to can still change.' },
  { type: 'basic', front: 'What does this log?\n\n' + fence('console.log(typeof null);'), back: '`"object"`. It is a long-standing quirk of the language.' },
  { type: 'basic', front: 'What does this log?\n\n' + fence('console.log([1, 2, 3].map((n) => n * 2));'), back: fence('[2, 4, 6]') },
  { type: 'basic', front: 'Rewrite with a template literal:\n\n' + fence("const msg = 'Hi ' + name + '!';"), back: fence('const msg = `Hi ${name}!`;') },
  { type: 'basic', front: 'What is the difference between `==` and `===`?', back: '`==` converts types before comparing; `===` compares without converting, so `0 === "0"` is false.' },
  { type: 'basic', front: 'How do you copy an array and add one item at the end, without changing the original?', back: fence('const next = [...items, extra];') },
  { type: 'basic', front: 'What does `async` change about a function?', back: 'It makes the function return a Promise, and lets you use `await` inside it.' },
  { type: 'basic', front: 'Pull `id` and `title` out of `book` in one statement.', back: fence('const { id, title } = book;') },
  { type: 'cloze', front: 'The {{c1::filter}} array method returns a new array holding only the items that pass a test.', back: 'Example: `nums.filter((n) => n > 0)`' },
  { type: 'cloze', front: 'Inside an `async` function, {{c1::await}} pauses until a {{c2::Promise}} settles.', back: 'Two blanks make two separate review items.' },
];

const ES_CARDS: Array<[string, string]> = [
  ['hello', 'hola'],
  ['thank you', 'gracias'],
  ['please', 'por favor'],
  ['water', 'agua'],
  ['bread', 'pan'],
  ['house', 'casa'],
  ['book', 'libro'],
  ['friend', 'amigo'],
  ['today', 'hoy'],
  ['tomorrow', 'mañana'],
  ['big', 'grande'],
  ['small', 'pequeño'],
  ['to eat', 'comer'],
  ['to speak', 'hablar'],
  ['where is the station?', '¿dónde está la estación?'],
];

const CAPITALS: Array<[string, string]> = [
  ['France', 'Paris'],
  ['Japan', 'Tokyo'],
  ['Brazil', 'Brasília'],
  ['Egypt', 'Cairo'],
  ['Canada', 'Ottawa'],
  ['Australia', 'Canberra'],
  ['Kenya', 'Nairobi'],
  ['Argentina', 'Buenos Aires'],
  ['Norway', 'Oslo'],
  ['Thailand', 'Bangkok'],
  ['Turkey', 'Ankara'],
  ['Peru', 'Lima'],
  ['Poland', 'Warsaw'],
  ['Vietnam', 'Hanoi'],
  ['Morocco', 'Rabat'],
];

const CAPITALS_MCQ: SampleCard[] = [
  { type: 'mcq', front: 'What is the capital of Italy?', back: 'Rome', distractors: ['Milan', 'Naples', 'Venice'] },
  { type: 'mcq', front: 'What is the capital of South Korea?', back: 'Seoul', distractors: ['Busan', 'Incheon', 'Pyongyang'] },
  { type: 'mcq', front: 'What is the capital of Nigeria?', back: 'Abuja', distractors: ['Lagos', 'Kano', 'Accra'] },
];

const cardsFor = (cards: SampleCard[], deckId: Id, deckNo: number, langFront: string | null, langBack: string | null): Card[] =>
  cards.map((c, i) => ({
    id: sampleId(100 + deckNo, i + 1),
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    deckId,
    type: c.type,
    front: c.front,
    back: c.back,
    distractors: c.distractors ?? [],
    mnemonic: '',
    tags: [],
    langFront,
    langBack,
    suspended: false,
    trouble: false,
  }));

function sampleDeck(id: Id, name: string, emoji: string, order: number, langFront: string, langBack: string): Deck {
  const t = Date.now();
  return {
    id, createdAt: t, updatedAt: t, deletedAt: null,
    folderId: SAMPLE_FOLDER_ID, name, description: '', color: '#6366f1', emoji, order,
    settings: { ...DEFAULT_DECK_SETTINGS, langFront, langBack },
    sourceId: null, matchBestMs: null,
  };
}

/**
 * Adds the Samples folder, its three decks and their cards. Records that are live are left as the
 * user has them; missing or soft-deleted ones are recreated, so running it again is harmless.
 */
export async function seedSampleDecks(): Promise<void> {
  const t = Date.now();
  if (!(await repo.listFolders()).some((f) => f.id === SAMPLE_FOLDER_ID)) {
    const folder: Folder = {
      id: SAMPLE_FOLDER_ID, createdAt: t, updatedAt: t, deletedAt: null,
      parentId: null, name: 'Samples', description: '', color: '#6366f1', emoji: '🎓', order: 0,
    };
    await repo.saveFolder(folder);
  }

  const decks: Array<{ deck: Deck; cards: Card[] }> = [
    {
      deck: sampleDeck(JS_DECK_ID, 'JavaScript Basics', '🟨', 0, 'en-US', 'en-US'),
      cards: cardsFor(JS_CARDS, JS_DECK_ID, 1, 'en-US', 'en-US'),
    },
    {
      deck: sampleDeck(ES_DECK_ID, 'Spanish Starter', '🇪🇸', 1, 'en-US', 'es-ES'),
      cards: cardsFor(ES_CARDS.map(([front, back]) => ({ type: 'reversible', front, back })), ES_DECK_ID, 2, 'en-US', 'es-ES'),
    },
    {
      deck: sampleDeck(CAPITALS_DECK_ID, 'World Capitals', '🌍', 2, 'en-US', 'en-US'),
      cards: cardsFor(
        [
          ...CAPITALS.map(([country, capital]): SampleCard => ({ type: 'basic', front: `What is the capital of ${country}?`, back: capital })),
          ...CAPITALS_MCQ,
        ],
        CAPITALS_DECK_ID, 3, 'en-US', 'en-US',
      ),
    },
  ];

  for (const { deck, cards } of decks) {
    const stored = await repo.getDeck(deck.id);
    if (!stored || stored.deletedAt !== null) await repo.saveDeck(deck);
    const missing: Card[] = [];
    for (const card of cards) {
      const existing = await repo.getCard(card.id);
      if (!existing || existing.deletedAt !== null) missing.push({ ...card, createdAt: t, updatedAt: t });
    }
    if (missing.length > 0) await repo.saveCards(missing);
  }
}
