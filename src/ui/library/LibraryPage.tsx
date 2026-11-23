import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type TreeNode } from '../../domain/tree';
import type { Deck, Folder, Id } from '../../domain/types';
import ToastRegion from '../components/ToastRegion';
import { useLibrary } from '../hooks/useLibrary';
import { useLibraryActions, type MoveTarget } from '../hooks/useLibraryActions';
import { strings } from '../strings';
import DeckDialog from './DeckDialog';
import FolderDialog from './FolderDialog';
import LibrarySearch from './LibrarySearch';
import MovePicker from './MovePicker';
import ShareDialog from '../share/ShareDialog';
import ExportMenu, { ExportDialog } from './ExportMenu';
import OnboardingEmpty from './OnboardingEmpty';
import type { RowAction } from './RowMenu';
import TreeView from './TreeView';

type DialogState =
  | { type: 'folder'; folder?: Folder }
  | { type: 'deck'; deck?: Deck }
  | { type: 'move'; node: TreeNode }
  | { type: 'share'; deck: Deck }
  | { type: 'export'; node: TreeNode }
  | null;

function findNode(nodes: TreeNode[], id: Id): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

function ancestors(id: Id, folders: Folder[]): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: Folder[] = [];
  const seen = new Set<Id>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

const primary = 'min-h-11 rounded-lg bg-accent-600 px-4 font-medium text-white hover:bg-accent-700';
const secondary =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';

export default function LibraryPage() {
  const { id } = useParams();
  const { ready, tree, folders, decks, dueCounts } = useLibrary();
  const actions = useLibraryActions(folders);
  const [dialog, setDialog] = useState<DialogState>(null);
  const closeDialog = () => setDialog(null);

  const scope = id ? findNode(tree, id) : undefined;
  const missing = ready && id !== undefined && scope?.kind !== 'folder';
  const nodes = id ? (scope?.children ?? []) : tree;
  const parentId: Id | null = id ?? null;

  function onAction(action: RowAction, node: TreeNode) {
    if (action === 'delete') void actions.remove(node);
    else if (action === 'duplicate') void actions.duplicate(node.id);
    else if (action === 'share') {
      const deck = decks.find((d) => d.id === node.id);
      if (deck) setDialog({ type: 'share', deck });
    } else if (action === 'export') setDialog({ type: 'export', node });
    else if (action === 'move') setDialog({ type: 'move', node });
    else if (node.kind === 'folder') setDialog({ type: 'folder', folder: folders.find((f) => f.id === node.id) });
    else setDialog({ type: 'deck', deck: decks.find((d) => d.id === node.id) });
  }

  function currentParent(node: TreeNode): Id | null {
    return (node.kind === 'folder' ? folders.find((f) => f.id === node.id)?.parentId : decks.find((d) => d.id === node.id)?.folderId) ?? null;
  }

  async function pick(node: TreeNode, target: Id | null) {
    closeDialog();
    await actions.move({ kind: node.kind, id: node.id }, target);
  }

  const dropMove = (target: MoveTarget, to: Id | null) => void actions.move(target, to);

  if (missing) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <p>{strings.library.folderNotFound}</p>
        <Link to="/" className={`${primary} mt-4 inline-flex items-center`}>{strings.common.goHome}</Link>
      </section>
    );
  }

  const showOnboarding = ready && !id && tree.length === 0;
  const crumbs = id ? ancestors(id, folders) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header className="space-y-3">
        {id && (
          <nav aria-label={strings.library.breadcrumb} className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
            <Link to="/" className="inline-flex min-h-11 items-center underline">{strings.library.title}</Link>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <span aria-hidden>/</span>
                {i < crumbs.length - 1 ? (
                  <Link to={`/folder/${c.id}`} className="inline-flex min-h-11 items-center underline">{c.name}</Link>
                ) : (
                  <span aria-current="page">{c.name}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">
            {scope ? `${scope.emoji} ${scope.name}` : strings.library.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            <ExportMenu scope={id ? 'folder' : 'library'} id={id ?? null} />
            <button type="button" onClick={() => setDialog({ type: 'folder' })} className={secondary}>{strings.library.newFolder}</button>
            <button type="button" onClick={() => setDialog({ type: 'deck' })} className={primary}>{strings.library.newDeck}</button>
          </div>
        </div>
        <LibrarySearch decks={decks} />
      </header>

      {!ready && <p className="text-slate-600 dark:text-slate-400">{strings.common.loading}</p>}
      {showOnboarding && <OnboardingEmpty onCreateDeck={() => setDialog({ type: 'deck' })} />}
      {ready && !showOnboarding && nodes.length === 0 && <p className="py-8 text-center text-slate-600 dark:text-slate-400">{strings.library.emptyFolder}</p>}
      {nodes.length > 0 && <TreeView nodes={nodes} dueCounts={dueCounts} onAction={onAction} onDropMove={dropMove} rootId={parentId} />}

      {dialog?.type === 'folder' && <FolderDialog folder={dialog.folder} parentId={parentId} onClose={closeDialog} />}
      {dialog?.type === 'deck' && <DeckDialog deck={dialog.deck} folderId={parentId} onClose={closeDialog} />}
      {dialog?.type === 'move' && (
        <MovePicker
          node={dialog.node}
          folders={folders}
          currentParentId={currentParent(dialog.node)}
          onPick={(target) => void pick(dialog.node, target)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'export' && <ExportDialog scope={dialog.node.kind} id={dialog.node.id} onClose={closeDialog} />}
      {dialog?.type === 'share' && <ShareDialog deck={dialog.deck} onClose={closeDialog} />}
      <ToastRegion toasts={actions.toasts} onClose={actions.dismissToast} />
    </div>
  );
}
