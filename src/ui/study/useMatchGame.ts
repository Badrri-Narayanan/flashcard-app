import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { dayKey } from '../../domain/day';
import { MIN_MATCH_CARDS, quizPrompt, shuffled } from '../../domain/distractors';
import { baseRecord } from '../../domain/ids';
import { stripMarkdown } from '../../domain/matcher';
import { mulberry32 } from '../../domain/queue';
import type { Card, Id, ReviewLog } from '../../domain/types';
import { useLoadRetry } from '../hooks/useLoadRetry';
import { useSettings } from '../settings/settings';
import { strings } from '../strings';
import { loadScopeCards } from './loadScopeCards';
import { checkPracticeTrouble, troubleToast, type StudyToast } from './troubleCheck';

export const WRONG_PENALTY_MS = 1000;
export const SHAKE_MS = 500;

export interface Tile {
  key: string;
  pairId: Id;
  text: string;
}

export interface MatchGame {
  loading: boolean;
  /** True when the cards could not be read; `retry` loads again. */
  loadFailed: boolean;
  retry(): void;
  /** False when the scope has too few non-suspended cards. */
  available: boolean;
  tiles: Tile[];
  pairCount: number;
  selected: string | null;
  matched: ReadonlySet<Id>;
  /** Tile keys currently shaking after a wrong pair. */
  shaking: ReadonlySet<string>;
  wrongTries: number;
  elapsedMs: number;
  finished: boolean;
  /** Final time with penalties, set once finished. */
  finalMs: number;
  /** Previous best for the deck, set once finished (deck scope only). */
  previousBestMs: number | null;
  newBest: boolean;
  pick(key: string): void;
  notice: StudyToast | null;
  clearNotice(): void;
}

const tileText = (md: string) => stripMarkdown(md) || strings.study.match.imageTile;

interface Pair {
  card: Card;
  front: Tile;
  back: Tile;
}

function buildPairs(cards: Card[], count: number, rng: () => number): Pair[] {
  const pairs: Pair[] = [];
  const used = new Set<string>();
  for (const card of shuffled(cards, rng)) {
    if (pairs.length >= count) break;
    const prompt = quizPrompt(card);
    if (!prompt) continue;
    const front = tileText(prompt.question);
    const back = tileText(prompt.answer);
    const keys = [front.toLowerCase(), back.toLowerCase()];
    if (keys[0] === keys[1] || keys.some((k) => used.has(k))) continue;
    keys.forEach((k) => used.add(k));
    pairs.push({
      card,
      front: { key: `${card.id}:front`, pairId: card.id, text: front },
      back: { key: `${card.id}:back`, pairId: card.id, text: back },
    });
  }
  return pairs;
}

/**
 * Match: pair fronts with backs as fast as you can. Wrong pairs cost one second. Writes one match ReviewLog per pair
 * (correct when no wrong attempt involved it) and never touches scheduling. `trackBest` keeps the deck's best time.
 */
export function useMatchGame(deckIds: Id[], pairTarget: number, trackBest: boolean): MatchGame {
  const [{ dayStartHour }] = useSettings();
  const deckKey = deckIds.join(',');
  const [loaded, setLoaded] = useState<{ available: boolean; pairs: Pair[]; tiles: Tile[]; startedAt: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<Id>>(new Set());
  const [shaking, setShaking] = useState<ReadonlySet<string>>(new Set());
  const [wrongTries, setWrongTries] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState({ finalMs: 0, previousBestMs: null as number | null, newBest: false });
  const [notice, setNotice] = useState<StudyToast | null>(null);
  const noticeId = useRef(0);
  const lastAt = useRef(0);
  const wrongPairs = useRef(new Set<Id>());
  const pending = useRef<Promise<void>[]>([]);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>();
  const load = useLoadRetry();
  const { attempt, fail: failLoad } = load;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { cards } = await loadScopeCards(deckKey);
      const available = cards.length >= MIN_MATCH_CARDS;
      const pairs = available ? buildPairs(cards, pairTarget, mulberry32(Date.now())) : [];
      const tiles = shuffled(
        pairs.flatMap((p) => [p.front, p.back]),
        mulberry32(Date.now() + 1),
      );
      if (cancelled) return;
      const startedAt = Date.now();
      lastAt.current = startedAt;
      setNow(startedAt);
      setLoaded({ available: available && pairs.length >= MIN_MATCH_CARDS, pairs, tiles, startedAt });
    })().catch((err: unknown) => {
      console.error('Failed to load match game', err);
      if (!cancelled) failLoad(err);
    });
    return () => {
      cancelled = true;
    };
  }, [deckKey, pairTarget, attempt, failLoad]);

  const playing = loaded !== null && loaded.pairs.length > 0 && !finished;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const fail = useCallback((message: string, err: unknown) => {
    console.error(message, err);
    setNotice({ id: ++noticeId.current, message: strings.study.saveFailed });
  }, []);

  const logPair = useCallback(
    async (card: Card, correct: boolean, durationMs: number, at: number) => {
      const [item] = await repo.getReviewItemsForCard(card.id);
      if (!item) return;
      const log: ReviewLog = {
        ...baseRecord(),
        reviewItemId: item.id,
        cardId: card.id,
        deckId: card.deckId,
        mode: 'match',
        rating: null,
        correct,
        confidence: null,
        durationMs,
        at,
        dayKey: dayKey(at, dayStartHour),
      };
      await repo.saveReview(null, log);
      const flaggedDeck = await checkPracticeTrouble(card.id);
      if (flaggedDeck) setNotice({ id: ++noticeId.current, ...troubleToast(flaggedDeck) });
    },
    [dayStartHour],
  );

  const finish = useCallback(
    async (finalMs: number) => {
      await Promise.all(pending.current);
      let previousBestMs: number | null = null;
      let newBest = false;
      if (trackBest && deckIds.length === 1) {
        try {
          const deck = await repo.getDeck(deckIds[0]);
          if (deck) {
            previousBestMs = deck.matchBestMs;
            newBest = deck.matchBestMs === null || finalMs < deck.matchBestMs;
            if (newBest) await repo.saveDeck({ ...deck, matchBestMs: finalMs, updatedAt: Date.now() });
          }
        } catch (err) {
          newBest = false;
          fail('Failed to save best time', err);
        }
      }
      setResult({ finalMs, previousBestMs, newBest });
      setFinished(true);
    },
    [trackBest, deckIds, fail],
  );

  const pick = useCallback(
    (key: string) => {
      if (!loaded || finished) return;
      const tile = loaded.tiles.find((t) => t.key === key);
      if (!tile || matched.has(tile.pairId) || key === selected) return;
      if (selected === null) {
        setSelected(key);
        return;
      }
      const other = loaded.tiles.find((t) => t.key === selected);
      setSelected(null);
      if (!other) return;
      if (other.pairId === tile.pairId) {
        const at = Date.now();
        const pair = loaded.pairs.find((p) => p.card.id === tile.pairId);
        const correct = !wrongPairs.current.has(tile.pairId);
        const nextMatched = new Set(matched).add(tile.pairId);
        setMatched(nextMatched);
        if (pair) {
          pending.current.push(logPair(pair.card, correct, Math.max(0, at - lastAt.current), at).catch((err) => fail('Failed to save match result', err)));
        }
        lastAt.current = at;
        if (nextMatched.size >= loaded.pairs.length) {
          const penalty = wrongTries * WRONG_PENALTY_MS;
          void finish(at - loaded.startedAt + penalty);
        }
        return;
      }
      wrongPairs.current.add(tile.pairId).add(other.pairId);
      setWrongTries((n) => n + 1);
      setShaking(new Set([tile.key, other.key]));
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShaking(new Set()), SHAKE_MS);
    },
    [loaded, finished, matched, selected, wrongTries, logPair, finish, fail],
  );

  const elapsedMs = finished ? result.finalMs : loaded ? Math.max(0, now - loaded.startedAt) + wrongTries * WRONG_PENALTY_MS : 0;

  return {
    loading: loaded === null,
    loadFailed: load.failed,
    retry: load.retry,
    available: loaded?.available ?? true,
    tiles: loaded?.tiles ?? [],
    pairCount: loaded?.pairs.length ?? 0,
    selected,
    matched,
    shaking,
    wrongTries,
    elapsedMs,
    finished,
    ...result,
    pick,
    notice,
    clearNotice: () => setNotice(null),
  };
}
