import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { repo } from '../../src/data/repo';
import { baseRecord } from '../../src/domain/ids';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Card, Deck } from '../../src/domain/types';
import DeckSettingsDialog from '../../src/ui/library/DeckSettingsDialog';
import { loadLearnQueue } from '../../src/ui/study/loadLearnQueue';
import { newDeckSettings } from '../../src/ui/settings/newDeckSettings';

afterEach(cleanup);
beforeEach(async () => {
  await db.delete();
  await db.open();
});

function mkDeck(): Deck {
  return {
    ...baseRecord(), folderId: null, name: 'D', description: '', color: '', emoji: '📚', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS }, sourceId: null, matchBestMs: null,
  };
}
function mkCard(deckId: string): Card {
  return {
    ...baseRecord(), deckId, type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false,
  };
}

describe('DeckSettingsDialog', () => {
  it('deck new/day change affects queue size', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    await repo.saveCards([mkCard(deck.id), mkCard(deck.id), mkCard(deck.id)]);
    expect((await loadLearnQueue([deck.id], Date.now(), 4)).queue).toHaveLength(3);

    const user = userEvent.setup();
    render(<DeckSettingsDialog deck={deck} onClose={() => undefined} />);
    const field = screen.getByLabelText('New cards per day');
    await user.clear(field);
    await user.type(field, '1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await repo.getDeck(deck.id))?.settings.newPerDay).toBe(1));
    expect((await loadLearnQueue([deck.id], Date.now(), 4)).queue).toHaveLength(1);
  });

  it('rejects non-integers and out-of-range values inline and does not save', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const user = userEvent.setup();
    render(<DeckSettingsDialog deck={deck} onClose={() => undefined} />);
    const field = screen.getByLabelText('Reviews per day');
    await user.clear(field);
    await user.type(field, '10000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a whole number from 0 to 9999.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a whole number from 0 to 9999.')).toBeInTheDocument();
    expect((await repo.getDeck(deck.id))?.settings.reviewsPerDay).toBe(200);
  });

  it('saves language and confidence prompt choices', async () => {
    const deck = mkDeck();
    await repo.saveDeck(deck);
    const user = userEvent.setup();
    render(<DeckSettingsDialog deck={deck} onClose={() => undefined} />);
    await user.selectOptions(screen.getByLabelText('Front language'), 'fr-FR');
    await user.selectOptions(screen.getByLabelText('Back language'), '');
    await user.click(screen.getByLabelText('Ask how sure I am before showing the answer'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const s = (await repo.getDeck(deck.id))?.settings;
      expect(s).toMatchObject({ langFront: 'fr-FR', langBack: '', confidencePrompt: false });
    });
  });
});

describe('newDeckSettings', () => {
  it('seeds confidencePrompt from the confidencePromptDefault setting', async () => {
    expect((await newDeckSettings()).confidencePrompt).toBe(true);
    await repo.setKV('settings', { confidencePromptDefault: false });
    expect((await newDeckSettings()).confidencePrompt).toBe(false);
  });
});
