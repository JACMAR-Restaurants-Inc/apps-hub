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
 * Two groups. The pure tests run in parallel, as ever. The *.db.test.ts files, which
 * run against staging Postgres in rolled-back transactions (skipped in CI), run ONE FILE
 * AT A TIME with more time each: in parallel, each file opened its own pool against
 * the session pooler, which allows 15 clients for the whole project (CLAUDE.md §1)
 * alongside a running dev server, and the longest test (about 30 queries) shared the
 * database with four other files inside a 5 s limit. It failed now and then
 * (2026-09-28, twice), always passing alone.
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
