/**
 * The one database connection. SERVER ONLY: the browser never talks to the database
 * (Supabase's Data API is switched off). Import it only from server code. The web app
 * should reach it through a module marked `import 'server-only'`, which turns a client
 * import into a build error; it is not marked here because the import scripts run it
 * from plain Node.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  // prepare: false - Supabase's transaction pooler (port 6543), which serverless
  // functions must use, does not support prepared statements.
  // idle_timeout: close a connection idle for 20 s. Serverless functions and dev's
  // hot reloads both leave pools behind; this drains them instead of holding pooler
  // slots open.
  // max: the session pooler allows 15 clients for the whole project, across every
  // process; a pool of 5 leaves room for migrations, imports and a second server.
  const max = Number(process.env.DB_POOL_MAX) || 5;
  const client = postgres(url, { prepare: false, idle_timeout: 20, max });
  return drizzle(client, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
