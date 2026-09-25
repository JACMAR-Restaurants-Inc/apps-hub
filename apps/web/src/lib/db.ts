import 'server-only';
import { createDb, type Db } from '@hub/db';

// Created on first use, not at import: `next build` imports server modules without
// any secrets (CI has none), and must not fail for want of a DATABASE_URL.
// Kept on globalThis so dev's hot reload does not open a new pool on every edit.
const g = globalThis as { hubDb?: Db };

export function db(): Db {
  return (g.hubDb ??= createDb());
}
