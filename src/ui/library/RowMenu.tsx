import { useEffect, useRef, useState } from 'react';
import type { TreeNode } from '../../domain/tree';
import { strings } from '../strings';

export type RowAction = 'edit' | 'move' | 'duplicate' | 'delete';

interface Props {
  node: TreeNode;
  onAction: (action: RowAction, node: TreeNode) => void;
}

const itemClass = 'block min-h-11 w-full px-4 text-start hover:bg-slate-100 dark:hover:bg-slate-800';

export default function RowMenu({ node, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { action: RowAction; label: string }[] = [
    { action: 'edit', label: node.kind === 'folder' ? strings.menu.rename : strings.menu.edit },
    { action: 'move', label: strings.menu.moveTo },
    ...(node.kind === 'deck' ? [{ action: 'duplicate' as const, label: strings.menu.duplicate }] : []),
    { action: 'delete', label: strings.menu.delete },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={strings.library.moreActions(node.name)}
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction(action, node);
              }}
              className={`${itemClass} ${action === 'delete' ? 'text-rose-600' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
