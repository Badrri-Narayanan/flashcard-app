import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import type { Card, Deck } from '../../domain/types';
import CardContent from '../components/CardContent';
import { strings } from '../strings';
import './print.css';
import {
  COLUMNS,
  buildQuizItems,
  buildSheets,
  parseLayout,
  toPrintItems,
  type PerPage,
  type PrintItem,
  type PrintLayout,
  type QuizItem,
} from './printModel';

type Paper = 'a4' | 'letter';
type Loaded = { deckId: string; data: { deck: Deck; cards: Card[] } | null };

const p = strings.print;
const LAYOUTS: PrintLayout[] = ['cards', 'worksheet', 'quiz'];
const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900';
const letter = (i: number) => String.fromCharCode(65 + i);

function CardsSheets({ items, perPage }: { items: PrintItem[]; perPage: PerPage }) {
  const style = { '--cols': COLUMNS[perPage] } as CSSProperties;
  return (
    <>
      {buildSheets(items, perPage).flatMap((sheet, i) =>
        (['front', 'back'] as const).map((side) => (
          <section key={`${i}-${side}`} className="print-sheet" aria-label={side === 'front' ? p.sheetFront(i + 1) : p.sheetBack(i + 1)}>
            <div className="print-grid" style={style}>
              {(side === 'front' ? sheet.fronts : sheet.backs).map((item, cell) => (
                <div key={cell} className="print-cell" data-testid={item ? `print-${side}` : undefined}>
                  {item && (
                    <CardContent markdown={side === 'front' ? item.front : item.back} lang={side === 'front' ? item.frontLang : item.backLang} />
                  )}
                </div>
              ))}
            </div>
          </section>
        )),
      )}
    </>
  );
}

function Worksheet({ items, showKey }: { items: PrintItem[]; showKey: boolean }) {
  return (
    <>
      <section className="print-doc">
        <ol className="list-decimal ps-6">
          {items.map((item) => (
            <li key={item.id} className="print-item" data-testid="worksheet-item">
              <CardContent markdown={item.front} lang={item.frontLang} />
              <div className="print-line" />
            </li>
          ))}
        </ol>
      </section>
      {showKey && (
        <section className="print-doc" style={{ breakBefore: 'page' }} data-testid="answer-key" aria-label={p.answerKey}>
          <h2 className="mb-3 text-lg font-semibold">{p.answerKey}</h2>
          <ol className="list-decimal ps-6">
            {items.map((item, i) => (
              <li key={item.id} data-testid={`key-${i + 1}`}>
                <CardContent markdown={item.back} lang={item.backLang} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function Quiz({ items, showKey }: { items: QuizItem[]; showKey: boolean }) {
  return (
    <>
      <section className="print-doc">
        <ol className="list-decimal ps-6">
          {items.map((q) => (
            <li key={q.id} className="print-item" data-testid="quiz-question">
              <CardContent markdown={q.question} lang={q.questionLang} />
              <ol className="mt-2 list-[upper-alpha] ps-6">
                {q.options.map((option, i) => (
                  <li key={i}>
                    <CardContent markdown={option} lang={q.optionLang} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
      {showKey && (
        <section className="print-doc" style={{ breakBefore: 'page' }} data-testid="answer-key" aria-label={p.answerKey}>
          <h2 className="mb-3 text-lg font-semibold">{p.answerKey}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {items.map((q, i) => (
              <li key={q.id} data-testid={`key-${i + 1}`}>
                {i + 1}. {letter(q.correctIndex)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function PrintPage() {
  const { deckId = '', layout: layoutParam } = useParams();
  const layout = parseLayout(layoutParam);
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [perPage, setPerPage] = useState<PerPage>(8);
  const [paper, setPaper] = useState<Paper>('a4');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const deck = await repo.getDeck(deckId);
      if (cancelled) return;
      if (!deck || deck.deletedAt !== null) return setLoaded({ deckId, data: null });
      const cards = (await repo.listCards(deckId)).sort((a, b) => a.createdAt - b.createdAt);
      if (!cancelled) setLoaded({ deckId, data: { deck, cards } });
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const content = useMemo(() => {
    const data = loaded?.data;
    if (!data) return null;
    if (layout === 'quiz') return { quiz: buildQuizItems(data.cards, data.deck), items: [] as PrintItem[] };
    return { quiz: null, items: toPrintItems(data.cards, data.deck) };
  }, [loaded, layout]);

  if (loaded?.deckId !== deckId) return <p className="p-8 text-center">{strings.common.loading}</p>;
  if (!loaded.data) return <p className="p-8 text-center">{p.notFound}</p>;
  const { deck } = loaded.data;

  const quiz = content?.quiz ?? null;
  const items = content?.items ?? [];
  const empty = quiz ? quiz.items.length === 0 : items.length === 0;

  return (
    <div className="print-root" data-paper={paper}>
      <style>{`@page { size: ${paper === 'a4' ? 'A4' : 'letter'}; margin: 10mm; }`}</style>
      <div className="no-print flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
        <Link to={`/deck/${deckId}`} className="inline-flex min-h-11 items-center px-2 underline">
          {p.back}
        </Link>
        <h1 className="text-lg font-semibold">{`${p.title}: ${deck.name}`}</h1>
        <label className="flex items-center gap-2">
          {p.layoutLabel}
          <select className={control} value={layout} onChange={(e) => navigate(`/print/${deckId}/${e.target.value}`, { replace: true })}>
            {LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {p.layouts[l]}
              </option>
            ))}
          </select>
        </label>
        {layout !== 'cards' && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />
            {p.includeKey}
          </label>
        )}
        {layout === 'cards' && (
          <label className="flex items-center gap-2">
            {p.perPage}
            <select className={control} value={perPage} onChange={(e) => setPerPage(Number(e.target.value) === 12 ? 12 : 8)}>
              <option value={8}>8</option>
              <option value={12}>12</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          {p.paper}
          <select className={control} value={paper} onChange={(e) => setPaper(e.target.value === 'letter' ? 'letter' : 'a4')}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-accent-600 px-5 font-medium text-white hover:bg-accent-700">
          {p.print}
        </button>
      </div>
      {quiz && quiz.skipped > 0 && (
        <p role="status" className="no-print px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
          {p.skipped(quiz.skipped)}
        </p>
      )}
      {empty ? (
        <p className="no-print p-8 text-center">{p.empty}</p>
      ) : quiz ? (
        <Quiz items={quiz.items} showKey={showKey} />
      ) : layout === 'worksheet' ? (
        <Worksheet items={items} showKey={showKey} />
      ) : (
        <CardsSheets items={items} perPage={perPage} />
      )}
    </div>
  );
}
