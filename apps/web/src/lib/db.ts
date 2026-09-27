import 'server-only';
import { createDb, type Db } from '@hub/db';
import { attachDatabasePool } from '@vercel/functions';

// Created on first use, not at import: `next build` imports server modules without
// any secrets (CI has none), and must not fail for want of a DATABASE_URL.
//
// ONE pool for the whole server process, kept on globalThis, so dev's hot reload and
// Turbopack's per-route copies of this module all share it. On 2026-09-25 this was
// briefly one pool PER module copy, to cure a hang that turned out to be the
// transaction pooler (CLAUDE.md §1), and the extra pools then ran into the session
// pooler's hard limit of 15 clients ("EMAXCONNSESSION max clients reached"): the
// access directory failed to load. createDb caps each pool (DB_POOL_MAX, default 5).
const g = globalThis as { hubDb?: Db };

export function db(): Db {
  if (!g.hubDb) {
    g.hubDb = createDb();
    // On Vercel, keeps the function alive until idle connections are closed, so a
    // suspended instance does not sit on pooler slots (the session pooler filled up this
    // way on 2026-09-26 and every page failed). Does nothing outside Vercel.
    attachDatabasePool(g.hubDb.$client);
  }
  return g.hubDb;
}
