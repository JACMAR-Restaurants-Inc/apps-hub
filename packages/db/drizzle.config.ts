import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema and committed. They run against staging
// first, always; production only after staging has run the same migration.
// DIRECT_URL is Supabase's SESSION pooler (port 5432): migrations must not go through
// the transaction pooler (6543), and the true direct connection is IPv6-only.
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema/index.ts',
  out: './packages/db/migrations',
  casing: 'snake_case',
  schemaFilter: ['rbac', 'cash', 'identity', 'portal', 'devops'],
  dbCredentials: {
    url: process.env.DIRECT_URL ?? '',
  },
});
