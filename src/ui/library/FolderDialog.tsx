import { repo } from '../../data/repo';
import { baseRecord } from '../../domain/ids';
import type { Folder, Id } from '../../domain/types';
import { strings } from '../strings';
import EntityDialog from './EntityDialog';

interface Props {
  folder?: Folder;
  parentId: Id | null;
  onClose: () => void;
}

export default function FolderDialog({ folder, parentId, onClose }: Props) {
  return (
    <EntityDialog
      title={folder ? strings.dialog.editFolder : strings.dialog.newFolder}
      initial={folder ?? {}}
      defaultEmoji="📁"
      onClose={onClose}
      onSubmit={(v) =>
        repo.saveFolder(
          folder
            ? { ...folder, ...v, updatedAt: Date.now() }
            : { ...baseRecord(), parentId, order: 0, ...v },
        )
      }
    />
  );
}
