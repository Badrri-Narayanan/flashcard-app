import { applyImport } from '../../data/backupIO';
import { repo } from '../../data/repo';
import { planImport, type MergePlan } from '../../domain/backup';
import { payloadToBackup, type SharePayload } from '../../domain/share';
import type { Id } from '../../domain/types';

export type ShareImportMode = 'add' | 'update' | 'copy';
export interface ShareImportResult {
  deckId: Id;
  summary: MergePlan['summary'];
}

/** Ids survive when the shared deck is new here; an existing id is either updated in place or copied. */
export async function importShare(payload: SharePayload, mode: ShareImportMode, targetFolderId: Id | null): Promise<ShareImportResult> {
  const file = payloadToBackup(payload);
  const sharedId = payload.deck.id;
  const existing = await repo.getExistingMeta();
  const merge = mode === 'add' ? (existing.ids.has(sharedId) ? 'copy' : 'update') : mode;
  const plan = planImport(file, existing, merge, targetFolderId);

  if (merge === 'copy') {
    // planCopy remaps sourceId along with the ids; the copy must still point at the shared deck.
    plan.put.decks = plan.put.decks.map((d) => ({ ...d, sourceId: sharedId }));
  } else if (existing.ids.has(sharedId)) {
    // An update replaces content only; local-only fields (order, best match time, suspension) are kept.
    const local = await repo.getDeck(sharedId);
    const localCards = new Map((await repo.listCards(sharedId)).map((c) => [c.id, c]));
    plan.put.decks = plan.put.decks.map((d) =>
      local ? { ...d, createdAt: local.createdAt, order: local.order, matchBestMs: local.matchBestMs, sourceId: local.sourceId } : d,
    );
    plan.put.cards = plan.put.cards.map((c) => {
      const l = localCards.get(c.id);
      return l ? { ...c, createdAt: l.createdAt, suspended: l.suspended, trouble: l.trouble } : c;
    });
  }
  await applyImport(plan);
  return { deckId: plan.put.decks[0]?.id ?? sharedId, summary: plan.summary };
}
