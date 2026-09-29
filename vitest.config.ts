import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  // `server-only` throws when imported outside a React server build. Tests import
  // server modules on purpose, so it is replaced by an empty module here only.
  'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
  '@/': fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
};
const everywhere = ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'];
const onPostgres = ['packages/*/src/**/*.db.test.ts', 'apps/web/src/**/*.db.test.ts'];

/**
 * Two groups. The pure tests run in parallel. The *.db.test.ts files, which run
 * against staging Postgres in rolled-back transactions (skipped in CI), run one file
 * at a time in one process, with 30 s per test: each file opens its own pool, and the
 * session pooler allows 15 clients for the whole project (CLAUDE.md §1), a running dev
 * server included.
 *
 * This was first written as the cure for a test that failed now and then. It was not:
 * that test compared audit rows without ORDER BY (see CLAUDE.md §6).
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: everywhere, exclude: onPostgres, alias } },
      // One fork for the whole group: its files run one after another in that process.
      // (fileParallelism cannot be set per project.)
      { test: { name: 'postgres', include: onPostgres, alias, pool: 'forks', poolOptions: { forks: { singleFork: true } }, testTimeout: 30_000 } },
    ],
  },
});
