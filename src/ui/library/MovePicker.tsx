import type { ReactNode } from 'react';
import { buildTree, wouldCreateCycle, type TreeNode } from '../../domain/tree';
import type { Folder, Id } from '../../domain/types';
import Dialog from '../components/Dialog';
import { strings } from '../strings';

interface Props {
  node: TreeNode;
  folders: Folder[];
  currentParentId: Id | null;
  onPick: (parentId: Id | null) => void;
  onClose: () => void;
}

const itemClass =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800';

export default function MovePicker({ node, folders, currentParentId, onPick, onClose }: Props) {
  const folderTree = buildTree(folders, []);

  function rows(nodes: TreeNode[], depth: number): ReactNode {
    return nodes.map((n) => {
      const disabled = node.kind === 'folder' && wouldCreateCycle(node.id, n.id, folders);
      return (
        <li key={n.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(n.id)}
            style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}
            className={itemClass}
          >
            <span aria-hidden>{n.emoji}</span>
            <span>{n.name}</span>
            {n.id === currentParentId && <span className="text-xs text-slate-500">{strings.move.current}</span>}
          </button>
          {n.children.length > 0 && <ul>{rows(n.children, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <Dialog title={strings.move.title(node.name)} onClose={onClose}>
      <ul>
        <li>
          <button type="button" onClick={() => onPick(null)} className={itemClass}>
            {strings.move.topLevel}
            {currentParentId === null && <span className="text-xs text-slate-500">{strings.move.current}</span>}
          </button>
        </li>
        {rows(folderTree, 0)}
      </ul>
    </Dialog>
  );
}
