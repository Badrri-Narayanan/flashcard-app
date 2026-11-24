import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { SAMPLE_FOLDER_ID, seedSampleDecks } from '../../src/data/seed';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function sampleDecks() {
  const decks = (await repo.listDecks()).filter((d) => d.folderId === SAMPLE_FOLDER_ID);
  return Promise.all(decks.map(async (d) => ({ deck: d, cards: await repo.listCards(d.id) })));
}

describe('seedSampleDecks', () => {
  it('creates a Samples folder with the three decks and their cards', async () => {
    await seedSampleDecks();
    const folders = await repo.listFolders();
    expect(folders.map((f) => f.name)).toEqual(['Samples']);
    const byName = new Map((await sampleDecks()).map((x) => [x.deck.name, x]));
    expect([...byName.keys()].sort()).toEqual(['JavaScript Basics', 'Spanish Starter', 'World Capitals']);

    const js = byName.get('JavaScript Basics')!.cards;
    expect(js).toHaveLength(10);
    expect(js.filter((c) => c.type === 'cloze')).toHaveLength(2);
    expect(js.some((c) => c.front.includes('```') || c.back.includes('```'))).toBe(true);

    const es = byName.get('Spanish Starter')!;
    expect(es.cards).toHaveLength(15);
    expect(es.cards.every((c) => c.type === 'reversible' && c.langBack === 'es-ES')).toBe(true);

    const wc = byName.get('World Capitals')!.cards;
    expect(wc).toHaveLength(18);
    expect(wc.filter((c) => c.type === 'basic')).toHaveLength(15);
    expect(wc.filter((c) => c.type === 'mcq')).toHaveLength(3);
    expect(wc.filter((c) => c.type === 'mcq').every((c) => c.distractors.length >= 2)).toBe(true);
  });

  it('creates review items for every variant, like the card editor does', async () => {
    await seedSampleDecks();
    const decks = await sampleDecks();
    const expected = decks.flatMap((d) => d.cards).reduce((n, c) => n + (c.type === 'reversible' ? 2 : 1), 0);
    const items = await repo.listReviewItems(decks.map((d) => d.deck.id));
    expect(items.length).toBeGreaterThanOrEqual(expected);
    const spanish = decks.find((d) => d.deck.name === 'Spanish Starter')!;
    for (const c of spanish.cards) {
      expect((await repo.getReviewItemsForCard(c.id)).map((i) => i.variant).sort()).toEqual(['fwd', 'rev']);
    }
  });

  it('seedSampleDecks is idempotent', async () => {
    await seedSampleDecks();
    const counts = async () => ({
      folders: await db.folders.count(),
      decks: await db.decks.count(),
      cards: await db.cards.count(),
      items: await db.reviewItems.count(),
    });
    const first = await counts();
    await seedSampleDecks();
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ folders: 1, decks: 3, cards: 43 });
  });

  it('recreates a soft-deleted sample deck but leaves an edited live card untouched', async () => {
    await seedSampleDecks();
    const decks = await sampleDecks();
    const js = decks.find((d) => d.deck.name === 'JavaScript Basics')!;
    const es = decks.find((d) => d.deck.name === 'Spanish Starter')!;
    const edited = { ...es.cards[0], back: 'my own edit' };
    await repo.saveCard(edited);
    const editedAt = (await repo.getCard(edited.id))!.updatedAt;

    await repo.deleteDeck(js.deck.id);
    expect(await repo.listCards(js.deck.id)).toHaveLength(0);

    await seedSampleDecks();
    const after = await sampleDecks();
    const jsAfter = after.find((d) => d.deck.id === js.deck.id)!;
    expect(jsAfter.cards).toHaveLength(10);
    expect(jsAfter.deck.deletedAt).toBeNull();
    expect((await repo.getReviewItemsForCard(jsAfter.cards[0].id)).length).toBeGreaterThan(0);
    const kept = (await repo.getCard(edited.id))!;
    expect(kept.back).toBe('my own edit');
    expect(kept.updatedAt).toBe(editedAt);
  });

  it('recreates a soft-deleted Samples folder', async () => {
    await seedSampleDecks();
    await repo.deleteFolder(SAMPLE_FOLDER_ID, { cascade: true });
    expect(await repo.listFolders()).toHaveLength(0);
    await seedSampleDecks();
    expect((await repo.listFolders()).map((f) => f.name)).toEqual(['Samples']);
    expect(await sampleDecks()).toHaveLength(3);
  });
});
