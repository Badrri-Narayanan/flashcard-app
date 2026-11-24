import { exportBackup } from '../../data/backupIO';
import { repo } from '../../data/repo';
import type { BackupScope } from '../../domain/backup';
import { cardsToCsv } from '../../domain/csv';
import { exportFilename } from '../../domain/exportName';
import type { Id } from '../../domain/types';
import { downloadBlob } from './download';

const CSV_BOM = '﻿';

async function nameFor(scope: BackupScope, id: Id | null): Promise<{ name: string; fallback: string }> {
  if (scope === 'library') return { name: '', fallback: 'library' };
  if (scope === 'deck') return { name: (id && (await repo.getDeck(id))?.name) || '', fallback: 'deck' };
  return { name: (await repo.listFolders()).find((f) => f.id === id)?.name ?? '', fallback: 'folder' };
}

/** Builds the requested export and hands it to the browser as a download. */
export async function runExport(
  scope: BackupScope,
  id: Id | null,
  kind: 'json' | 'csv',
  includeHistory: boolean,
): Promise<void> {
  const { name, fallback } = await nameFor(scope, id);
  if (kind === 'json') {
    downloadBlob(await exportBackup(scope, id, { includeHistory }), exportFilename(name, fallback, 'json'));
  } else {
    const csv = cardsToCsv(await repo.listCards(id ?? ''));
    downloadBlob(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }), exportFilename(name, fallback, 'csv'));
  }
}
