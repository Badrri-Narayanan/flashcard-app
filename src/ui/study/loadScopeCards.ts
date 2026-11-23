import { repo } from '../../data/repo';
import type { Card, Deck, Id } from '../../domain/types';

/** Live decks for the ids plus their non-suspended cards. */
export async function loadScopeCards(deckKey: string): Promise<{ decks: Map<Id, Deck>; cards: Card[] }> {
  const ids = deckKey ? deckKey.split(',') : [];
  const decks = (await Promise.all(ids.map((id) => repo.getDeck(id)))).filter(
    (d): d is Deck => !!d && d.deletedAt === null,
  );
  const lists = await Promise.all(decks.map((d) => repo.listCards(d.id)));
  return { decks: new Map(decks.map((d) => [d.id, d])), cards: lists.flat().filter((c) => !c.suspended) };
}
