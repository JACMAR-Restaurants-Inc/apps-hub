import 'server-only';
import { createDb, type Db } from '@hub/db';

// Created on first use, not at import: `next build` imports server modules without
// any secrets (CI has none), and must not fail for want of a DATABASE_URL.
//
// One pool PER MODULE COPY, deliberately not shared on globalThis. It used to be, to
// stop dev's hot reload opening a pool per edit - but Turbopack can give a route its
// own copy of this module, and a pool created by one copy hung forever when queried
// from another (2026-09-25: the access directory never rendered; its queries sat on
// the server waiting for the client). Pools left behind by reloads close their idle
// connections themselves (idle_timeout in createDb).
let instance: Db | undefined;

export function db(): Db {
  return (instance ??= createDb());
}
