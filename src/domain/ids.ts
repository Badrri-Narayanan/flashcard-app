import type { BaseRecord, Id } from './types';

export function newId(): Id {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export function baseRecord(): BaseRecord {
  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

export function touch<T extends BaseRecord>(record: T): T {
  return { ...record, updatedAt: now() };
}
