import { useCallback, useState } from 'react';
import { repo } from '../../data/repo';
import { wouldCreateCycle, type TreeNode } from '../../domain/tree';
import type { Folder, Id } from '../../domain/types';
import { UNDO_TOAST_MS } from '../components/toastTiming';
import { strings } from '../strings';

export interface ToastItem {
  id: number;
  message: string;
  onUndo?: () => void;
  durationMs: number;
}

export interface MoveTarget {
  kind: TreeNode['kind'];
  id: Id;
}

const REJECT_TOAST_MS = 4000;
let nextToastId = 1;

/** Mutations for library rows; every outcome (including failures) surfaces as a toast. */
export function useLibraryActions(folders: Folder[]) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message: string, opts: { onUndo?: () => void; durationMs?: number } = {}) => {
    setToasts((t) => [...t, { id: nextToastId++, message, durationMs: opts.durationMs ?? UNDO_TOAST_MS, onUndo: opts.onUndo }]);
  }, []);

  const guard = useCallback(
    async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.error('Library action failed', err);
        push(strings.library.actionFailed);
        return fallback;
      }
    },
    [push],
  );

  const remove = useCallback(
    (node: TreeNode) =>
      guard(async () => {
        const restore = node.kind === 'folder' ? () => repo.restoreFolder(node.id) : () => repo.restoreDeck(node.id);
        if (node.kind === 'folder') await repo.deleteFolder(node.id, { cascade: true });
        else await repo.deleteDeck(node.id);
        push(strings.library.deleted(node.name), { onUndo: () => void guard(restore, undefined) });
      }, undefined),
    [guard, push],
  );

  const duplicate = useCallback((id: Id) => guard(async () => void (await repo.duplicateDeck(id)), undefined), [guard]);

  /** Returns false (and shows a toast) when the move fails or would create a folder cycle. */
  const move = useCallback(
    (target: MoveTarget, parentId: Id | null): Promise<boolean> => {
      if (target.kind === 'folder' && wouldCreateCycle(target.id, parentId, folders)) {
        push(strings.library.cantMoveIntoSelf, { durationMs: REJECT_TOAST_MS });
        return Promise.resolve(false);
      }
      return guard(async () => {
        if (target.kind === 'folder') await repo.moveFolder(target.id, parentId);
        else await repo.moveDeck(target.id, parentId);
        return true;
      }, false);
    },
    [folders, guard, push],
  );

  return { toasts, dismissToast, remove, duplicate, move };
}
