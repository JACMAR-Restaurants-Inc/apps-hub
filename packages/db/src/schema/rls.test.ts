import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './index';

// Supabase's automatic RLS covers only the public schema, not rbac or cash: the first
// staging migration (2026-09-25) created all 18 tables with RLS off. So every table
// enables it here. No policies are written: with RLS on and none granted, the Data API
// roles see nothing even if someone turns the Data API back on. The app connects as
// the table owner, which RLS does not restrict.
describe('row level security', () => {
  const tables = Object.values(schema as Record<string, unknown>).filter((v): v is PgTable => is(v, PgTable));

  it('finds the tables', () => {
    expect(tables.length).toBeGreaterThanOrEqual(22);
  });

  it.each(tables.map((t) => [`${getTableConfig(t).schema}.${getTableConfig(t).name}`, t] as const))(
    '%s enables RLS',
    (_, table) => {
      expect(getTableConfig(table).enableRLS).toBe(true);
    },
  );
});
