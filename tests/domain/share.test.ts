import { describe, expect, it, vi } from 'vitest';

const compress = vi.hoisted(() => ({ calls: 0 }));
vi.mock('lz-string', async (orig) => {
  const actual = (await orig<{ default: typeof import('lz-string') }>()).default;
  const counted = {
    ...actual,
    compressToEncodedURIComponent: (s: string) => {
      compress.calls++;
      return actual.compressToEncodedURIComponent(s);
    },
  };
  return { ...counted, default: counted };
});

import type { BackupMedia } from '../../src/domain/backup';
import { baseRecord } from '../../src/domain/ids';
import { buildSharePayload, decodeShare, encodeShare, payloadToBackup } from '../../src/domain/share';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';

const deck = (over: Partial<Deck> = {}): Deck => ({
  ...baseRecord(), folderId: null, name: 'Spanish', description: 'basics', color: '#6366f1', emoji: '📚', order: 3,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: 1200, ...over,
});
const card = (deckId: string, over: Partial<Card> = {}): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: 'hola', back: 'hello', distractors: [], mnemonic: '',
  tags: ['a'], langFront: 'es', langBack: 'en', suspended: true, trouble: true, ...over,
});

function noise(n: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
const media = (id: string, size: number): BackupMedia => ({ id, mime: 'image/png', width: 1, height: 1, dataBase64: noise(size) });

describe('share payloads', () => {
  it('encode -> decode round-trips and never carries review state or local-only fields', () => {
    const d = deck();
    const { payload } = buildSharePayload(d, [card(d.id), card(d.id, { front: 'adiós 🌍' })], () => undefined);
    const decoded = decodeShare(encodeShare(payload));
    expect(decoded).toEqual({ ok: true, payload, skipped: 0 });
    expect(payload.deck).not.toHaveProperty('order');
    expect(payload.cards[0]).not.toHaveProperty('suspended');
    expect(payload).not.toHaveProperty('reviewItems');
  });

  it('decodeShare returns error for truncated payload', () => {
    const d = deck();
    const { payload } = buildSharePayload(d, Array.from({ length: 20 }, (_, i) => card(d.id, { front: `q${i}${noise(30)}` })), () => undefined);
    const s = encodeShare(payload);
    const r = decodeShare(s.slice(0, s.length / 2));
    expect(r.ok).toBe(false);
  });

  it('rejects garbage and structurally wrong payloads as invalid', () => {
    expect(decodeShare('')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeShare('!!!not-a-share!!!')).toMatchObject({ ok: false });
    const wrong = encodeShare({ v: 2 } as never);
    expect(decodeShare(wrong)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('skips and counts damaged cards and images, and rejects a deck with bad settings', () => {
    const d = deck();
    const { payload } = buildSharePayload(d, [card(d.id)], () => undefined);
    const hostile = {
      ...payload,
      cards: [...payload.cards, { ...payload.cards[0], id: 'x1', distractors: [1, 2] }, { ...payload.cards[0], id: 'x2', tags: 'a' },
        { ...payload.cards[0], id: 'x3', type: 'weird' }, { ...payload.cards[0], id: 'x4', langFront: 5 },
        { ...payload.cards[0], id: 'x5', updatedAt: 'now' }],
      media: [{ id: 'm', mime: 'text/html', width: 1, height: 1, dataBase64: 'AAAA' }],
    };
    expect(decodeShare(encodeShare(hostile as never))).toEqual({ ok: true, payload, skipped: 6 });
    for (const settings of [{ ...DEFAULT_DECK_SETTINGS, newPerDay: '20' }, { ...DEFAULT_DECK_SETTINGS, newPerDay: -1 }, null]) {
      expect(decodeShare(encodeShare({ ...payload, deck: { ...payload.deck, settings } } as never))).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(decodeShare(encodeShare({ ...payload, deck: { ...payload.deck, updatedAt: 'x' } } as never))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('buildSharePayload drops images over budget and reports count', () => {
    const d = deck();
    const cards = [card(d.id, { front: '![](media:m1)' }), card(d.id, { front: '![](media:m2)' }), card(d.id, { front: '![](media:m1)' })];
    const store = new Map([['m1', media('m1', 2_000)], ['m2', media('m2', 50_000)]]);
    const { payload, droppedImages } = buildSharePayload(d, cards, (id) => store.get(id), 10_000);
    expect(payload.media.map((m) => m.id)).toEqual(['m1']);
    expect(droppedImages).toBe(1);
    expect(encodeShare(payload).length).toBeLessThanOrEqual(10_000);

    const all = buildSharePayload(d, cards, (id) => store.get(id));
    expect(all.payload.media).toHaveLength(2);
    expect(all.droppedImages).toBe(0);
  });

  it('payloadToBackup produces a valid deck-scope backup whose deck points back at the shared id', () => {
    const d = deck();
    const { payload } = buildSharePayload(d, [card(d.id)], () => undefined);
    const file = payloadToBackup(payload);
    expect(file.scope).toBe('deck');
    expect(file.decks[0]).toMatchObject({ id: d.id, sourceId: d.id, folderId: null, deletedAt: null });
    expect(file.cards[0]).toMatchObject({ deckId: d.id, suspended: false, trouble: false });
  });

  it('compresses a bounded number of times however many images there are', () => {
    const d = deck();
    const ids = Array.from({ length: 60 }, (_, i) => `m${i}`);
    const cards = ids.map((id) => card(d.id, { front: `![](media:${id})` }));
    const store = new Map(ids.map((id) => [id, media(id, 5_000)]));
    compress.calls = 0;
    const { payload, droppedImages } = buildSharePayload(d, cards, (id) => store.get(id), 100_000);
    expect(compress.calls).toBeLessThanOrEqual(4);
    expect(payload.media.length + droppedImages).toBe(60);
    expect(droppedImages).toBeGreaterThan(0);
    expect(encodeShare(payload).length).toBeLessThanOrEqual(100_000);
  });
});
