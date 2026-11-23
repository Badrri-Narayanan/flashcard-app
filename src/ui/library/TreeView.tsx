import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TreeNode } from '../../domain/tree';
import type { Id } from '../../domain/types';
import type { DueCounts } from '../hooks/useLibrary';
import type { MoveTarget } from '../hooks/useLibraryActions';
import { strings } from '../strings';
import RowMenu, { type RowAction } from './RowMenu';

interface Props {
  nodes: TreeNode[];
  dueCounts: DueCounts;
  onAction: (action: RowAction, node: TreeNode) => void;
  /** Called when a row is dropped on a folder (id) or the root area (null). */
  onDropMove: (target: MoveTarget, parentId: Id | null) => void;
}

function Badges({ counts }: { counts?: { due: number; new: number } }) {
  if (!counts) return null;
  return (
    <span className="flex shrink-0 gap-1 text-xs font-medium">
      {counts.due > 0 && (
        <span aria-label={strings.library.dueLabel(counts.due)} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
          {strings.library.due(counts.due)}
        </span>
      )}
      {counts.new > 0 && (
        <span aria-label={strings.library.newLabel(counts.new)} className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
          {strings.library.new(counts.new)}
        </span>
      )}
    </span>
  );
}

export default function TreeView({ nodes, dueCounts, onAction, onDropMove }: Props) {
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set());
  const [hoverId, setHoverId] = useState<Id | 'root' | null>(null);
  const dragged = useRef<MoveTarget | null>(null);

  function toggle(id: Id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function dropOn(e: DragEvent, parentId: Id | null) {
    e.preventDefault();
    e.stopPropagation();
    setHoverId(null);
    const target = dragged.current;
    dragged.current = null;
    if (target) onDropMove(target, parentId);
  }

  function renderNode(node: TreeNode): ReactNode {
    const isFolder = node.kind === 'folder';
    const isOpen = isFolder && !collapsed.has(node.id);
    const dropProps = isFolder
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragged.current) return;
            e.preventDefault();
            e.stopPropagation();
            setHoverId(node.id);
          },
          onDragLeave: () => setHoverId((h) => (h === node.id ? null : h)),
          onDrop: (e: DragEvent) => dropOn(e, node.id),
        }
      : {};
    return (
      <li
        key={node.id}
        role="treeitem"
        aria-expanded={isFolder ? isOpen : undefined}
        data-node-id={node.id}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          dragged.current = { kind: node.kind, id: node.id };
          e.dataTransfer?.setData('text/plain', node.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          dragged.current = null;
          setHoverId(null);
        }}
        {...dropProps}
      >
        <div
          className={`flex items-center gap-1 rounded-xl border-s-4 bg-white ps-1 pe-1 shadow-sm dark:bg-slate-900 ${
            hoverId === node.id ? 'ring-2 ring-accent-500' : ''
          }`}
          style={{ borderInlineStartColor: node.color || undefined }}
        >
          {isFolder ? (
            <button
              type="button"
              aria-label={isOpen ? strings.library.collapse(node.name) : strings.library.expand(node.name)}
              onClick={() => toggle(node.id)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span aria-hidden className={`transition-transform ${isOpen ? 'rotate-90' : 'rtl:rotate-180'}`}>▸</span>
            </button>
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <Link
            to={isFolder ? `/folder/${node.id}` : `/deck/${node.id}`}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2"
          >
            <span aria-hidden className="text-2xl">{node.emoji}</span>
            <span className="truncate font-medium">{node.name}</span>
            <Badges counts={dueCounts[node.id]} />
          </Link>
          <RowMenu node={node} onAction={onAction} />
        </div>
        {isFolder && isOpen && node.children.length > 0 && (
          <ul role="group" className="ms-6 mt-2 space-y-2">
            {node.children.map(renderNode)}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (!dragged.current) return;
        e.preventDefault();
        setHoverId('root');
      }}
      onDragLeave={() => setHoverId((h) => (h === 'root' ? null : h))}
      onDrop={(e) => dropOn(e, null)}
      className={`space-y-2 rounded-xl p-1 ${hoverId === 'root' ? 'ring-2 ring-accent-500' : ''}`}
    >
      <ul role="tree" aria-label={strings.library.treeLabel} className="space-y-2">
        {nodes.map(renderNode)}
      </ul>
    </div>
  );
}
