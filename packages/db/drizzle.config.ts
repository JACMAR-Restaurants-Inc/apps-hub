import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema and committed. They run against staging
// first, always; production only after staging has run the same migration.
// DIRECT_URL is the direct (port 5432) connection: migrations must not go through
// the transaction pooler.
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema/index.ts',
  out: './packages/db/migrations',
  casing: 'snake_case',
  schemaFilter: ['rbac', 'cash'],
  dbCredentials: {
    url: process.env.DIRECT_URL ?? '',
  },
});
