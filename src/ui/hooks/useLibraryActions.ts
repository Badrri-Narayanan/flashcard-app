import { useCallback, useState } from 'react';
import { repo } from '../../data/repo';
import { wouldCreateCycle, type TreeNode } from '../../domain/tree';
import type { Folder, Id } from '../../domain/types';
import { strings } from '../strings';

export interface ToastState {
  message: string;
  onUndo?: () => void;
}

export interface MoveTarget {
  kind: TreeNode['kind'];
  id: Id;
}

/** Mutations for library rows; surfaces results through a single toast. */
export function useLibraryActions(folders: Folder[]) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const remove = useCallback(async (node: TreeNode) => {
    if (node.kind === 'folder') {
      await repo.deleteFolder(node.id, { cascade: true });
      setToast({ message: strings.library.deleted(node.name), onUndo: () => void repo.restoreFolder(node.id) });
    } else {
      await repo.deleteDeck(node.id);
      setToast({ message: strings.library.deleted(node.name), onUndo: () => void repo.restoreDeck(node.id) });
    }
  }, []);

  const duplicate = useCallback(async (id: Id) => {
    await repo.duplicateDeck(id);
  }, []);

  /** Returns false (and shows a toast) when the move would create a folder cycle. */
  const move = useCallback(
    async (target: MoveTarget, parentId: Id | null): Promise<boolean> => {
      if (target.kind === 'folder') {
        if (wouldCreateCycle(target.id, parentId, folders)) {
          setToast({ message: strings.library.cantMoveIntoSelf });
          return false;
        }
        await repo.moveFolder(target.id, parentId);
      } else {
        await repo.moveDeck(target.id, parentId);
      }
      return true;
    },
    [folders],
  );

  return { toast, dismissToast, remove, duplicate, move };
}
