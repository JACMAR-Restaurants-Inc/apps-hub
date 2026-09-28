/**
 * Cash Balancing's Admin page (App.html renderAdmin, Api.gs apiAdmin*), rebuilt around
 * what is actually edited, with what the old panel lacked (safe-count §8):
 *
 * - Only these fields can change: a restaurant's expected safe total and report email,
 *   and its tills (label, base amount, retired or not). Not the restaurant's number:
 *   changing it would orphan every past count. The old API accepted ANY sheet name.
 * - Every change is journaled (cash.settings_log) with the values before and after.
 * - Every change checks, under a row lock, that the value is still what the page
 *   showed; if someone changed it meanwhile, it answers 'changed' (as the portal's
 *   admin writes do, CLAUDE.md §3).
 * - A till is retired, never deleted.
 *
 * The caller has already passed authorize('SafeCount', 'admin_panel', 'access').
 */

import { restaurantSettings, settingsLog, tills, type Db } from '@hub/db';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Conn } from './store';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type AdminOutcome = 'done' | 'unchanged' | 'changed' | 'invalid' | 'exists' | 'not_found';

const MAX_EXPECTED = 100_000_000; // $1,000,000
const MAX_BASE = 10_000_000; // $100,000
const cents = (n: unknown, max: number, min = 0): n is number => Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
const tillNo = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 1 && (n as number) <= 99;
export const cleanLabel = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '');
/** An address, lower-cased, or '' for none. Null when it is not an address at all. */
export function cleanEmail(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const e = s.trim().toLowerCase();
  if (!e) return '';
  return e.length <= 254 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/.test(e) ? e : null;
}

async function inTx<T>(db: Conn, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}
async function log(tx: Tx, actor: string, restaurantId: string, event: string, before: string | null, after: string | null, tillNumber: number | null = null) {
  await tx.insert(settingsLog).values({ actorEmail: actor, restaurantId, event, tillNumber, before, after });
}

export interface AdminRestaurant {
  expectedTotalCents: number | null;
  reportEmail: string | null;
  tills: { tillNumber: number; tillLabel: string; baseAmountCents: number; active: boolean }[];
}

/** What the Admin page shows, per restaurant. */
export async function adminOverview(db: Conn, storeIds: readonly string[]): Promise<Map<string, AdminRestaurant>> {
  const out = new Map<string, AdminRestaurant>(storeIds.map((id) => [id, { expectedTotalCents: null, reportEmail: null, tills: [] }]));
  if (!storeIds.length) return out;
  const [settings, rows] = await Promise.all([
    db.select().from(restaurantSettings).where(inArray(restaurantSettings.restaurantId, [...storeIds])),
    db.select().from(tills).where(inArray(tills.restaurantId, [...storeIds])).orderBy(asc(tills.tillNumber)),
  ]);
  for (const s of settings) Object.assign(out.get(s.restaurantId)!, { expectedTotalCents: s.expectedSafeTotalCents, reportEmail: s.reportEmail });
  for (const t of rows) out.get(t.restaurantId)!.tills.push({ tillNumber: t.tillNumber, tillLabel: t.tillLabel, baseAmountCents: t.baseAmountCents, active: t.active });
  return out;
}

/**
 * The expected safe total. Every variance after this is measured against it, so the
 * page asks twice and the journal keeps both values. `shown` is what the page showed:
 * null for a restaurant with none yet, which this then creates.
 */
export async function setExpectedTotal(db: Conn, actor: string, rid: string, shown: number | null, next: number): Promise<AdminOutcome> {
  if (!cents(next, MAX_EXPECTED, 1) || (shown !== null && !cents(shown, MAX_EXPECTED, 0))) return 'invalid';
  return inTx(db, async (tx) => {
    const [row] = await tx.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, rid)).for('update');
    const current = row?.expectedSafeTotalCents ?? null;
    if (current !== shown) return 'changed';
    if (current === next) return 'unchanged';
    if (row) await tx.update(restaurantSettings).set({ expectedSafeTotalCents: next }).where(eq(restaurantSettings.restaurantId, rid));
    else await tx.insert(restaurantSettings).values({ restaurantId: rid, expectedSafeTotalCents: next });
    await log(tx, actor, rid, 'expected_total', current === null ? null : String(current), String(next));
    return 'done';
  });
}

/** Where this restaurant's reports go. Empty means none. */
export async function setReportEmail(db: Conn, actor: string, rid: string, shown: string | null, raw: unknown): Promise<AdminOutcome> {
  const next = cleanEmail(raw);
  if (next === null) return 'invalid';
  return inTx(db, async (tx) => {
    const [row] = await tx.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, rid)).for('update');
    // Settings come with an expected total; set that first.
    if (!row) return 'not_found';
    const current = row.reportEmail ?? null;
    if ((current ?? '') !== (shown ?? '')) return 'changed';
    if ((current ?? '') === next) return 'unchanged';
    await tx.update(restaurantSettings).set({ reportEmail: next || null }).where(eq(restaurantSettings.restaurantId, rid));
    await log(tx, actor, rid, 'report_email', current, next || null);
    return 'done';
  });
}

export async function addTill(db: Conn, actor: string, rid: string, number: unknown, label: unknown, base: unknown): Promise<AdminOutcome> {
  const name = cleanLabel(label);
  if (!tillNo(number) || !name || name.length > 40 || !cents(base, MAX_BASE)) return 'invalid';
  return inTx(db, async (tx) => {
    const inserted = await tx.insert(tills).values({ restaurantId: rid, tillNumber: number, tillLabel: name, baseAmountCents: base }).onConflictDoNothing().returning();
    if (!inserted.length) return 'exists';
    await log(tx, actor, rid, 'till_add', null, `${name} · ${base}`, number);
    return 'done';
  });
}

/** A till's label and base amount, if they are still what the page showed. */
export async function updateTill(
  db: Conn,
  actor: string,
  rid: string,
  number: unknown,
  shown: { label: string; base: number },
  next: { label: unknown; base: unknown },
): Promise<AdminOutcome> {
  const name = cleanLabel(next.label);
  if (!tillNo(number) || !name || name.length > 40 || !cents(next.base, MAX_BASE)) return 'invalid';
  const base = next.base as number;
  return inTx(db, async (tx) => {
    const [row] = await tx.select().from(tills).where(and(eq(tills.restaurantId, rid), eq(tills.tillNumber, number))).for('update');
    if (!row) return 'not_found';
    if (row.tillLabel !== shown.label || row.baseAmountCents !== shown.base) return 'changed';
    if (row.tillLabel === name && row.baseAmountCents === base) return 'unchanged';
    await tx.update(tills).set({ tillLabel: name, baseAmountCents: base }).where(and(eq(tills.restaurantId, rid), eq(tills.tillNumber, number)));
    if (row.tillLabel !== name) await log(tx, actor, rid, 'till_label', row.tillLabel, name, number);
    if (row.baseAmountCents !== base) await log(tx, actor, rid, 'till_base', String(row.baseAmountCents), String(base), number);
    return 'done';
  });
}

/** Retire a till, or bring it back. Never a delete. */
export async function setTillActive(db: Conn, actor: string, rid: string, number: unknown, active: boolean): Promise<AdminOutcome> {
  if (!tillNo(number) || typeof active !== 'boolean') return 'invalid';
  return inTx(db, async (tx) => {
    const [row] = await tx.select().from(tills).where(and(eq(tills.restaurantId, rid), eq(tills.tillNumber, number))).for('update');
    if (!row) return 'not_found';
    if (row.active === active) return 'unchanged';
    await tx.update(tills).set({ active }).where(and(eq(tills.restaurantId, rid), eq(tills.tillNumber, number)));
    await log(tx, actor, rid, active ? 'till_restore' : 'till_retire', null, null, number);
    return 'done';
  });
}

export async function recentChanges(db: Conn, storeIds: readonly string[], limit = 50) {
  if (!storeIds.length) return [];
  return db
    .select()
    .from(settingsLog)
    .where(inArray(settingsLog.restaurantId, [...storeIds]))
    .orderBy(desc(settingsLog.at), desc(settingsLog.id))
    .limit(limit);
}

/** The next free till number at a restaurant, for "Ajouter une caisse". */
export async function nextTillNumber(db: Conn, rid: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(max(${tills.tillNumber}), 0) + 1` }).from(tills).where(eq(tills.restaurantId, rid));
  return Number(row?.n ?? 1);
}
