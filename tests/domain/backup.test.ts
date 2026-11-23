import { describe, expect, it } from 'vitest';
import { planImport, SCHEMA_VERSION, validateBackup, type BackupFile } from '../../src/domain/backup';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck, Folder, ReviewItem } from '../../src/domain/types';

const folder = (over: Partial<Folder> = {}): Folder => ({
  ...baseRecord(), parentId: null, name: 'F', description: '', color: '', emoji: '', order: 0, ...over,
});
const deck = (over: Partial<Deck> = {}): Deck => ({
  ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '', order: 0,
  settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null, ...over,
});
const card = (deckId: string, over: Partial<Card> = {}): Card => ({
  ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
  tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
});
const item = (c: Card): ReviewItem => ({
  ...baseRecord(), cardId: c.id, deckId: c.deckId, variant: 'fwd', due: 1, stability: 1, difficulty: 1,
  elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0, state: 2, lastReview: 1,
});

function file(over: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'flashcards', schemaVersion: SCHEMA_VERSION, exportedAt: 1, scope: 'library',
    folders: [], decks: [], cards: [], media: [], ...over,
  };
}
const empty = () => ({ ids: new Set<string>(), updatedAt: new Map<string, number>() });

describe('validateBackup', () => {
  it('accepts a well-formed file', () => {
    expect(validateBackup(file())).toEqual({ ok: true, file: file() });
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['wrong app', { ...file(), app: 'other' }],
    ['missing cards', { ...file(), cards: undefined }],
    ['non-array decks', { ...file(), decks: {} }],
    ['ill-typed reviewItems', { ...file(), reviewItems: 'x' }],
    ['bad scope', { ...file(), scope: 'everything' }],
    ['non-numeric schemaVersion', { ...file(), schemaVersion: '1' }],
    ['card without id', { ...file(), cards: [{ front: 'x' }] }],
    ['media without data', { ...file(), media: [{ id: 'm', mime: 'image/png', width: 1, height: 1 }] }],
  ])('rejects %s', (_n, raw) => {
    const r = validateBackup(raw);
    expect(r.ok).toBe(false);
  });

  it('rejects newer schema versions with a friendly message', () => {
    const r = validateBackup({ ...file(), schemaVersion: 99 });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('made by a newer version');
  });
});

describe('planImport update mode', () => {
  it('adds unknown records and counts them', () => {
    const d = deck();
    const c = card(d.id);
    const plan = planImport(file({ decks: [d], cards: [c], reviewItems: [item(c)] }), empty(), 'update', null);
    expect(plan.put.decks).toEqual([d]);
    expect(plan.put.cards).toEqual([c]);
    expect(plan.put.reviewItems).toHaveLength(1);
    expect(plan.summary).toEqual({ added: 2, updated: 0, skipped: 0 });
  });

  it('replaces only when incoming is newer', () => {
    const d = deck();
    const newer = card(d.id, { updatedAt: 200 });
    const older = card(d.id, { updatedAt: 50 });
    const plan = planImport(
      file({ decks: [d], cards: [newer, older] }),
      { ids: new Set([newer.id, older.id]), updatedAt: new Map([[newer.id, 100], [older.id, 100]]) },
      'update',
      null,
    );
    expect(plan.put.cards.map((c) => c.id)).toEqual([newer.id]);
    expect(plan.summary).toMatchObject({ updated: 1, skipped: 1 });
  });

  it('skips review items and logs whose id exists locally', () => {
    const d = deck();
    const c = card(d.id);
    const i = item(c);
    const plan = planImport(
      file({ cards: [c], reviewItems: [i] }),
      { ids: new Set([i.id]), updatedAt: new Map([[i.id, 1]]) },
      'update',
      null,
    );
    expect(plan.put.reviewItems).toEqual([]);
  });

  it('puts only newly added file roots under the target folder', () => {
    const f = folder();
    const inner = deck({ folderId: f.id });
    const loose = deck();
    const known = deck({ folderId: 'local-parent', updatedAt: 9 });
    const plan = planImport(
      file({ folders: [f], decks: [inner, loose, known] }),
      { ids: new Set([known.id]), updatedAt: new Map([[known.id, 1]]) },
      'update',
      'target',
    );
    const byId = new Map(plan.put.decks.map((d) => [d.id, d]));
    expect(plan.put.folders[0].parentId).toBe('target');
    expect(byId.get(inner.id)!.folderId).toBe(f.id);
    expect(byId.get(loose.id)!.folderId).toBe('target');
    expect(byId.get(known.id)!.folderId).toBe('local-parent');
  });
});

describe('planImport copy mode', () => {
  it('remaps ids and media refs consistently', () => {
    const f = folder();
    const d = deck({ folderId: f.id });
    const c = card(d.id, { front: 'see ![x](media:m1)', back: 'media:m1 and media:m2', mnemonic: 'media:m2' });
    const i = item(c);
    const plan = planImport(
      file({
        folders: [f], decks: [d], cards: [c], reviewItems: [i],
        reviewLogs: [{
          ...baseRecord(), reviewItemId: i.id, cardId: c.id, deckId: d.id, mode: 'learn', rating: 3, correct: true,
          confidence: null, durationMs: 1, at: 1, dayKey: '2026-01-01',
        }],
        media: [
          { id: 'm1', mime: 'image/png', width: 1, height: 1, dataBase64: 'eA==' },
          { id: 'm2', mime: 'image/png', width: 1, height: 1, dataBase64: 'eA==' },
        ],
      }),
      empty(),
      'copy',
      'target',
    );
    const [nf] = plan.put.folders;
    const [nd] = plan.put.decks;
    const [nc] = plan.put.cards;
    const [ni] = plan.put.reviewItems;
    const [nl] = plan.put.reviewLogs;
    const [m1, m2] = plan.put.media;
    expect(new Set([nf.id, nd.id, nc.id, ni.id, nl.id, m1.id, m2.id, f.id, d.id, c.id]).size).toBe(10);
    expect(nf.parentId).toBe('target');
    expect(nd.folderId).toBe(nf.id);
    expect(nc.deckId).toBe(nd.id);
    expect(ni).toMatchObject({ cardId: nc.id, deckId: nd.id });
    expect(nl).toMatchObject({ reviewItemId: ni.id, cardId: nc.id, deckId: nd.id });
    expect(nc.front).toBe(`see ![x](media:${m1.id})`);
    expect(nc.back).toBe(`media:${m1.id} and media:${m2.id}`);
    expect(nc.mnemonic).toBe(`media:${m2.id}`);
    expect(plan.summary).toEqual({ added: 3, updated: 0, skipped: 0 });
  });

  it('puts file-root decks under the target folder, or at the root when null', () => {
    const d = deck({ folderId: 'gone' });
    expect(planImport(file({ decks: [d] }), empty(), 'copy', 'T').put.decks[0].folderId).toBe('T');
    expect(planImport(file({ decks: [d] }), empty(), 'copy', null).put.decks[0].folderId).toBeNull();
  });
});
