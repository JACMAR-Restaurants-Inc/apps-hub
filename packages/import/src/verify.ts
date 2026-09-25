/**
 * After an import: read everything back and check it, per docs/CUTOVER.md "Checks after
 * the import". It reads the DATABASE, not the plan, so it checks what actually landed.
 *
 * Reports counts and keys, never names, emails or amounts.
 */

import type { Db } from '@hub/db';
import {
  admins,
  attachments,
  countCoins,
  countPaper,
  countPettyCash,
  countTills,
  permissionRoles,
  permissions,
  reportJobs,
  restaurantSettings,
  restaurants,
  safeCounts,
  tillFixes,
  tills,
  users,
} from '@hub/db';
import { sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { ID_TABLES } from './load';
import type { Plan } from './transform';

export interface Report {
  failures: string[];
  notes: string[];
}

const norm = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);

/** Every planned row exists in the database with the same value in every planned field. */
function compare(
  name: string,
  planned: Record<string, unknown>[],
  actual: Record<string, unknown>[],
  key: (r: Record<string, unknown>) => string,
  report: Report,
) {
  const byKey = new Map(actual.map((r) => [key(r), r]));
  let missing = 0;
  const differs = new Map<string, number>();
  for (const p of planned) {
    const a = byKey.get(key(p));
    if (!a) {
      missing++;
      continue;
    }
    for (const [field, value] of Object.entries(p)) {
      if (JSON.stringify(norm(value)) !== JSON.stringify(norm(a[field]))) differs.set(field, (differs.get(field) ?? 0) + 1);
    }
  }
  if (missing) report.failures.push(`${name}: ${missing} of ${planned.length} rows missing`);
  for (const [field, n] of differs) report.failures.push(`${name}: ${n} rows differ in ${field}`);
  const plannedKeys = new Set(planned.map(key));
  const extra = actual.filter((r) => !plannedKeys.has(key(r))).length;
  if (extra) report.notes.push(`${name}: ${extra} rows in the database are not in this snapshot (kept; nothing is deleted)`);
  if (!missing && !differs.size) report.notes.push(`${name}: ${planned.length} rows match`);
}

export async function verify(db: Db, plan: Plan): Promise<Report> {
  const report: Report = { failures: [], notes: [] };
  const all = (t: PgTable) => db.select().from(t) as Promise<Record<string, unknown>[]>;
  const byId = (r: Record<string, unknown>) => String(r.id);
  const k = (...fields: string[]) => (r: Record<string, unknown>) => fields.map((f) => String(r[f])).join('|');

  const [dbCounts, dbTills, dbCoins, dbPaper, dbPetty] = await Promise.all([
    all(safeCounts),
    all(countTills),
    all(countCoins),
    all(countPaper),
    all(countPettyCash),
  ]);

  // 1. Row by row, table by table.
  compare('rbac.restaurants', plan.restaurants, await all(restaurants), k('restaurantId'), report);
  compare('rbac.users', plan.users, await all(users), k('email'), report);
  compare('rbac.admins', plan.admins, await all(admins), k('email'), report);
  compare('rbac.permissions', plan.permissions, await all(permissions), k('app', 'resource', 'action'), report);
  compare('rbac.permission_roles', plan.permissionRoles, await all(permissionRoles), k('app', 'resource', 'action', 'role'), report);
  compare('cash.restaurant_settings', plan.restaurantSettings, await all(restaurantSettings), k('restaurantId'), report);
  compare('cash.tills', plan.tills, await all(tills), k('restaurantId', 'tillNumber'), report);
  compare('cash.safe_counts', plan.safeCounts, dbCounts, byId, report);
  compare('cash.count_tills', plan.countTills, dbTills, byId, report);
  compare('cash.count_coins', plan.countCoins, dbCoins, byId, report);
  compare('cash.count_paper', plan.countPaper, dbPaper, byId, report);
  compare('cash.count_petty_cash', plan.countPettyCash, dbPetty, byId, report);
  compare('cash.till_fixes', plan.tillFixes, await all(tillFixes), byId, report);
  compare('cash.attachments', plan.attachments, await all(attachments), byId, report);
  compare('cash.report_jobs', plan.reportJobs, await all(reportJobs), byId, report);

  // 2. The arithmetic, recomputed in cents from what is in the database.
  const sumBy = (rows: Record<string, unknown>[], field: string) => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.safeCountId as number, (m.get(r.safeCountId as number) ?? 0) + (r[field] as number));
    return m;
  };
  const tillSum = sumBy(dbTills, 'countedAmountCents');
  const coinSum = sumBy(dbCoins, 'totalCents');
  const paperSum = sumBy(dbPaper, 'totalCents');
  const pettySum = sumBy(dbPetty, 'amountCents');
  const wrong = { grandTotal: 0, variance: 0, tills: 0, coins: 0, paper: 0, pettyCash: 0 };
  for (const c of dbCounts) {
    const n = (f: string) => c[f] as number;
    const id = c.id as number;
    if (n('tillsTotalCents') + n('coinsTotalCents') + n('paperTotalCents') + n('pettyCashTotalCents') !== n('grandTotalCents')) wrong.grandTotal++;
    if (n('grandTotalCents') - n('expectedTotalCents') !== n('varianceCents')) wrong.variance++;
    if ((tillSum.get(id) ?? 0) !== n('tillsTotalCents')) wrong.tills++;
    if ((coinSum.get(id) ?? 0) !== n('coinsTotalCents')) wrong.coins++;
    if ((paperSum.get(id) ?? 0) !== n('paperTotalCents')) wrong.paper++;
    if ((pettySum.get(id) ?? 0) !== n('pettyCashTotalCents')) wrong.pettyCash++;
  }
  for (const [what, n] of Object.entries(wrong)) {
    if (n) report.failures.push(`${n} counts: ${what} does not add up`);
  }
  if (Object.values(wrong).every((n) => n === 0)) {
    report.notes.push(`all ${dbCounts.length} counts add up: totals, variance, and every total against its lines`);
  }

  // 3. Each sequence is past the highest id, so a new count cannot collide.
  for (const table of ID_TABLES) {
    const { schema, name } = getTableConfig(table);
    const q = `"${schema}"."${name}"`;
    const [row] = (await db.execute(
      sql.raw(
        `select (select max(id) from ${q}) as max_id, (select last_value from pg_sequences where schemaname = '${schema}' and sequencename = split_part(pg_get_serial_sequence('${q}', 'id'), '.', 2)) as last_value`,
      ),
    )) as unknown as { max_id: number | null; last_value: number | null }[];
    if (row?.max_id != null && (row.last_value == null || Number(row.last_value) < Number(row.max_id))) {
      report.failures.push(`${schema}.${name}: sequence at ${row.last_value}, below the highest id ${row.max_id}`);
    }
  }

  // 4. No credentials came across. Config_Managers is refused before anything is
  // written; this checks nothing named like a credential exists in our data schemas,
  // and that Better Auth's password column (unused: Google only) is empty.
  const credentialColumns = (await db.execute(
    sql.raw(
      `select table_schema, table_name, column_name from information_schema.columns where table_schema in ('rbac','cash') and column_name ~* '(login|password|passwd|secret)'`,
    ),
  )) as unknown as unknown[];
  if (credentialColumns.length) report.failures.push(`${credentialColumns.length} credential-like columns exist in rbac/cash`);
  const [pw] = (await db.execute(
    sql.raw(`select count(*)::int as n from identity.accounts where password is not null`),
  )) as unknown as { n: number }[];
  if (pw && pw.n > 0) report.failures.push(`identity.accounts: ${pw.n} rows hold a password`);
  if (!credentialColumns.length && !pw?.n) report.notes.push('no login or password columns or values');

  return report;
}
