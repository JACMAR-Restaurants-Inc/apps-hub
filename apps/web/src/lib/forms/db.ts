import 'server-only';
import { createDb, type Db } from '@hub/db';
import { attachDatabasePool } from '@vercel/functions';
import { db } from '../db';

/**
 * Forms' own database getter (CLAUDE.md §3, "each app stays separable"), as
 * Cash Balancing's: `FORMS_DATABASE_URL`, falling back to `DATABASE_URL`. Until that
 * setting differs, it IS the portal's pool, not a second one (15 clients, CLAUDE.md §3, database connections).
 */
const g = globalThis as { formsDb?: Db };

export function formsDb(): Db {
  const url = process.env.FORMS_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) return db();
  if (!g.formsDb) {
    g.formsDb = createDb(url);
    attachDatabasePool(g.formsDb.$client);
  }
  return g.formsDb;
}
