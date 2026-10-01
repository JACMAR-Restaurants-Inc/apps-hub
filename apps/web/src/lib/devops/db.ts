import 'server-only';
import { createDb, type Db } from '@hub/db';
import { attachDatabasePool } from '@vercel/functions';
import { db } from '../db';

/**
 * JM DevOps' own database getter (CLAUDE.md §3, "each app stays separable"), as
 * Cash Balancing's: `DEVOPS_DATABASE_URL`, falling back to `DATABASE_URL`. Until that
 * setting differs, it IS the portal's pool, not a second one (15 clients, CLAUDE.md §3, database connections).
 */
const g = globalThis as { devopsDb?: Db };

export function devopsDb(): Db {
  const url = process.env.DEVOPS_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) return db();
  if (!g.devopsDb) {
    g.devopsDb = createDb(url);
    attachDatabasePool(g.devopsDb.$client);
  }
  return g.devopsDb;
}
