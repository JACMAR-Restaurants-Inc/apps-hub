import 'server-only';
import { createDb, type Db } from '@hub/db';
import { attachDatabasePool } from '@vercel/functions';
import { db } from '../db';

/**
 * Cash Balancing's own database getter (CLAUDE.md §3, "each app stays separable").
 * `CASH_DATABASE_URL`, falling back to `DATABASE_URL`: moving the app to its own
 * database is then a setting. Until that setting differs, it IS the portal's pool, not
 * a second one: the session pooler allows 15 clients for the whole project (§1).
 */
const g = globalThis as { cashDb?: Db };

export function cashDb(): Db {
  const url = process.env.CASH_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) return db();
  if (!g.cashDb) {
    g.cashDb = createDb(url);
    attachDatabasePool(g.cashDb.$client);
  }
  return g.cashDb;
}
