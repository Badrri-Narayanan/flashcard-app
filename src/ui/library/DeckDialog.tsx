import { repo } from '../../data/repo';
import { baseRecord } from '../../domain/ids';
import { DEFAULT_DECK_SETTINGS, type Deck, type Id } from '../../domain/types';
import { strings } from '../strings';
import EntityDialog from './EntityDialog';

interface Props {
  deck?: Deck;
  folderId: Id | null;
  onClose: () => void;
}

export default function DeckDialog({ deck, folderId, onClose }: Props) {
  return (
    <EntityDialog
      title={deck ? strings.dialog.editDeck : strings.dialog.newDeck}
      initial={deck ?? {}}
      defaultEmoji="📚"
      onClose={onClose}
      onSubmit={(v) =>
        repo.saveDeck(
          deck
            ? { ...deck, ...v, updatedAt: Date.now() }
            : {
                ...baseRecord(),
                folderId,
                order: 0,
                settings: { ...DEFAULT_DECK_SETTINGS },
                sourceId: null,
                matchBestMs: null,
                ...v,
              },
        )
      }
    />
  );
}
