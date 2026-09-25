/**
 * Writing a Plan to the database.
 *
 * - ONE transaction for everything, so a count and its children always land together,
 *   and a failure halfway leaves the database exactly as it was.
 * - Safe to run again (staging runs it many times): every row is an upsert on its key,
 *   so a second run from the same snapshot changes nothing, and a newer snapshot
 *   updates rows in place. Nothing is ever deleted: a row that disappeared from the
 *   sheet stays, and verify.ts reports it.
 * - Ids are kept. Afterwards each identity sequence is moved to the highest id, so
 *   the next new count gets max + 1 instead of colliding with an imported one.
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
import { getTableColumns, sql } from 'drizzle-orm';
import { toSnakeCase } from 'drizzle-orm/casing';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { Plan } from './transform';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Well under Postgres's 65,535 parameters per statement for the widest table.
const CHUNK = 500;

async function upsert(tx: Tx, table: PgTable, rows: object[], key: PgColumn[]) {
  const keyNames = new Set(key.map((c) => c.name));
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, col]) => !keyNames.has(col.name))
      .map(([prop]) => [prop, sql.raw(`excluded."${toSnakeCase(prop)}"`)]),
  );
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const insert = tx.insert(table).values(chunk as never);
    await (Object.keys(set).length
      ? insert.onConflictDoUpdate({ target: key, set })
      : insert.onConflictDoNothing({ target: key }));
  }
}

/** The tables whose ids are kept from the sheet and must have their sequence moved. */
export const ID_TABLES = [safeCounts, countTills, countCoins, countPaper, countPettyCash, tillFixes, attachments, reportJobs];

export async function load(db: Db, plan: Plan) {
  await db.transaction(async (tx) => {
    // Parents before children, so every foreign key already has its target.
    await upsert(tx, restaurants, plan.restaurants, [restaurants.restaurantId]);
    await upsert(tx, users, plan.users, [users.email]);
    await upsert(tx, admins, plan.admins, [admins.email]);
    await upsert(tx, permissions, plan.permissions, [permissions.app, permissions.resource, permissions.action]);
    await upsert(tx, permissionRoles, plan.permissionRoles, [
      permissionRoles.app,
      permissionRoles.resource,
      permissionRoles.action,
      permissionRoles.role,
    ]);
    await upsert(tx, restaurantSettings, plan.restaurantSettings, [restaurantSettings.restaurantId]);
    await upsert(tx, tills, plan.tills, [tills.restaurantId, tills.tillNumber]);
    await upsert(tx, safeCounts, plan.safeCounts, [safeCounts.id]);
    await upsert(tx, countTills, plan.countTills, [countTills.id]);
    await upsert(tx, countCoins, plan.countCoins, [countCoins.id]);
    await upsert(tx, countPaper, plan.countPaper, [countPaper.id]);
    await upsert(tx, countPettyCash, plan.countPettyCash, [countPettyCash.id]);
    await upsert(tx, tillFixes, plan.tillFixes, [tillFixes.id]);
    await upsert(tx, attachments, plan.attachments, [attachments.id]);
    await upsert(tx, reportJobs, plan.reportJobs, [reportJobs.id]);

    for (const table of ID_TABLES) {
      const { schema, name } = getTableConfig(table);
      const qualified = `"${schema}"."${name}"`;
      // setval(seq, max, true): the next value handed out is max + 1. An empty table
      // is left alone.
      await tx.execute(
        sql.raw(
          `select setval(pg_get_serial_sequence('${qualified}', 'id'), max(id)) from ${qualified} having max(id) is not null`,
        ),
      );
    }
  });
}
