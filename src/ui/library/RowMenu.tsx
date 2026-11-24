import { useEffect, useRef, useState } from 'react';
import type { TreeNode } from '../../domain/tree';
import { strings } from '../strings';

export type RowAction = 'edit' | 'move' | 'duplicate' | 'share' | 'settings' | 'export' | 'delete';

interface Props {
  node: TreeNode;
  onAction: (action: RowAction, node: TreeNode) => void;
}

const itemClass = 'block min-h-11 w-full px-4 text-start hover:bg-slate-100 dark:hover:bg-slate-800';

/** Disclosure popover of buttons: focus moves in on open, Esc returns it to the trigger. */
export default function RowMenu({ node, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { action: RowAction; label: string }[] = [
    { action: 'edit', label: node.kind === 'folder' ? strings.menu.rename : strings.menu.edit },
    { action: 'move', label: strings.menu.moveTo },
    ...(node.kind === 'deck' ? [
          { action: 'duplicate' as const, label: strings.menu.duplicate },
          { action: 'share' as const, label: strings.menu.share },
          { action: 'settings' as const, label: strings.menu.deckSettings },
        ] : []),
    { action: 'export', label: strings.menu.export },
    { action: 'delete', label: strings.menu.delete },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={strings.library.moreActions(node.name)}
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        ⋯
      </button>
      {open && (
        <div
          ref={panelRef}
          className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
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
