import { repo } from '../../data/repo';
import { newDeckSettings } from '../settings/newDeckSettings';
import { baseRecord } from '../../domain/ids';
import { type Deck, type Id } from '../../domain/types';
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
      onSubmit={async (v) =>
        repo.saveDeck(
          deck
            ? { ...deck, ...v, updatedAt: Date.now() }
            : {
                ...baseRecord(),
                folderId,
                order: 0,
                settings: await newDeckSettings(),
                sourceId: null,
                matchBestMs: null,
                ...v,
              },
        )
      }
    />
  );
}
