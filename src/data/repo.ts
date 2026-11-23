import { db } from './db';
import { DexieRepository } from './dexieRepository';
import type { Repository } from './repository';

export const repo: Repository = new DexieRepository(db);
