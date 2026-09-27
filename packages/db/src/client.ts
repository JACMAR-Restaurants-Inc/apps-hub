/**
 * The one database connection. SERVER ONLY: the browser never talks to the database
 * (Supabase's Data API is switched off). Import it only from server code. The web app
 * should reach it through a module marked `import 'server-only'`, which turns a client
 * import into a build error; it is not marked here because the import scripts run it
 * from plain Node.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export function createDb(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  // node-postgres (pg), not postgres.js, since 2026-09-26. postgres.js sends several
  // queries down one connection without waiting (pipelining), and through Supabase's
  // TRANSACTION pooler (6543) queries then hung: Postgres showed them `active`, waiting
  // on the client (`ClientRead`), first in `next dev` (2026-09-25) and then on Vercel,
  // where every page stopped. pg sends one query at a time per connection, and it is
  // the pool Vercel's attachDatabasePool understands (apps/web/src/lib/db.ts).
  // Unnamed statements only: the transaction pooler cannot keep a prepared statement
  // between transactions, and pg prepares only a query given a name, which we never do.
  // idleTimeoutMillis: close a connection idle for 5 s, so a pool left behind (a
  // suspended function, a hot reload) gives its pooler slots back quickly.
  // max: the session pooler allows 15 clients for the whole project, across every
  // process; a pool of 5 leaves room for migrations, imports and a second server.
  const max = Number(process.env.DB_POOL_MAX) || 5;
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 });
  // An idle connection the pooler drops must not crash the process: pg emits 'error'
  // on the pool, and an unhandled 'error' event would kill the server.
  pool.on('error', (error) => console.error('database pool error', error.message));
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
