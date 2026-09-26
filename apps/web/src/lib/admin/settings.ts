/**
 * What used to be done by hand in the Access Control spreadsheet (RBAC §48: "still only
 * in the spreadsheet: the kill switch and the Admins tab"), now that there is no
 * spreadsheet: a person's global switch, the admins and their `notify`, and the
 * restaurants. Parity checklist D.
 *
 * Every function takes the database (or a transaction) and the acting admin, already
 * established by requireSystemAdmin. Each change is one transaction with its audit row,
 * and each refuses what would lock people out or lose the record:
 * - you cannot switch yourself off, nor remove yourself as admin;
 * - the last admin cannot be removed (with none, the break-glass address would quietly
 *   become the only admin, RBAC §5);
 * - a restaurant is closed, never deleted: counts and grants still point at it.
 * Removing an admin deletes the admins row: that table holds a role, not history, and
 * the audit row keeps who removed whom and when.
 */

import { normalizeEmail } from '@hub/core';
import { admins, audit, restaurants, users, type Db } from '@hub/db';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export type SettingsOutcome = 'done' | 'unchanged' | 'not_found' | 'self' | 'last_admin' | 'invalid' | 'exists';

async function inTx<T>(db: Conn, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

/** The kill switch (RBAC §30/§31): one person, every app, at once. */
export async function setPersonActive(db: Conn, admin: string, rawEmail: string, active: boolean): Promise<SettingsOutcome> {
  const email = normalizeEmail(rawEmail);
  if (!email.includes('@')) return 'invalid';
  if (email === normalizeEmail(admin) && !active) return 'self';
  return inTx(db, async (tx) => {
    const [u] = await tx.select({ active: users.active }).from(users).where(eq(users.email, email)).for('update');
    if (!u) return 'not_found';
    if (u.active === active) return 'unchanged';
    await tx.update(users).set({ active }).where(eq(users.email, email));
    await tx.insert(audit).values({ actorEmail: admin, event: 'user_active', targetEmail: email, detail: { before: u.active, after: active } });
    return 'done';
  });
}

/**
 * Make someone a system admin. They need no app row: admins bypass can() (step 1). A
 * person not yet on the roster is added, switched on, so the admin row has its person.
 */
export async function addAdmin(db: Conn, admin: string, rawEmail: string, fullName?: string): Promise<SettingsOutcome> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'invalid';
  return inTx(db, async (tx) => {
    const [existing] = await tx.select({ email: admins.email }).from(admins).where(eq(admins.email, email));
    if (existing) return 'exists';
    const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.email, email));
    if (!u) await tx.insert(users).values({ email, fullName: fullName?.trim() || null, active: true, addedBy: admin });
    await tx.insert(admins).values({ email, addedBy: admin, notify: false });
    await tx.insert(audit).values({ actorEmail: admin, event: 'admin_add', targetEmail: email, detail: { newPerson: !u } });
    return 'done';
  });
}

export async function removeAdmin(db: Conn, admin: string, rawEmail: string): Promise<SettingsOutcome> {
  const email = normalizeEmail(rawEmail);
  if (email === normalizeEmail(admin)) return 'self';
  return inTx(db, async (tx) => {
    // Lock the whole table: two admins removing each other at once must not leave none.
    await tx.execute(sql`lock table ${admins} in share row exclusive mode`);
    const rows = await tx.select({ email: admins.email, notify: admins.notify }).from(admins);
    const row = rows.find((r) => r.email === email);
    if (!row) return 'not_found';
    if (rows.length <= 1) return 'last_admin';
    await tx.delete(admins).where(eq(admins.email, email));
    await tx.insert(audit).values({ actorEmail: admin, event: 'admin_remove', targetEmail: email, detail: { notify: row.notify } });
    return 'done';
  });
}

/** Whether an admin is emailed when somebody asks for access (RBAC Notify.gs). */
export async function setAdminNotify(db: Conn, admin: string, rawEmail: string, notify: boolean): Promise<SettingsOutcome> {
  const email = normalizeEmail(rawEmail);
  return inTx(db, async (tx) => {
    const [row] = await tx.select({ notify: admins.notify }).from(admins).where(eq(admins.email, email)).for('update');
    if (!row) return 'not_found';
    if (row.notify === notify) return 'unchanged';
    await tx.update(admins).set({ notify }).where(eq(admins.email, email));
    await tx.insert(audit).values({ actorEmail: admin, event: 'admin_notify', targetEmail: email, detail: { before: row.notify, after: notify } });
    return 'done';
  });
}

/** A restaurant id is the McDonald's store number: digits (the imported ones are 4-5). */
export const validRestaurantId = (id: string) => /^\d{3,6}$/.test(id);

export async function addRestaurant(db: Conn, admin: string, rawId: string, rawName: string): Promise<SettingsOutcome> {
  const id = rawId.trim();
  const name = rawName.trim();
  if (!validRestaurantId(id) || !name || name.length > 80) return 'invalid';
  return inTx(db, async (tx) => {
    const [existing] = await tx.select({ id: restaurants.restaurantId }).from(restaurants).where(eq(restaurants.restaurantId, id));
    if (existing) return 'exists';
    // Opens closed: a new restaurant grants nothing until someone opens it on purpose.
    await tx.insert(restaurants).values({ restaurantId: id, name, active: false });
    await tx.insert(audit).values({ actorEmail: admin, event: 'restaurant_add', restaurantId: id, detail: { name } });
    return 'done';
  });
}

/** Open or close a restaurant. Closed denies whatever any row says (can() step 5). */
export async function setRestaurantActive(db: Conn, admin: string, id: string, active: boolean): Promise<SettingsOutcome> {
  return inTx(db, async (tx) => {
    const [r] = await tx.select({ active: restaurants.active }).from(restaurants).where(eq(restaurants.restaurantId, id)).for('update');
    if (!r) return 'not_found';
    if (r.active === active) return 'unchanged';
    await tx.update(restaurants).set({ active }).where(eq(restaurants.restaurantId, id));
    await tx.insert(audit).values({ actorEmail: admin, event: 'restaurant_active', restaurantId: id, detail: { before: r.active, after: active } });
    return 'done';
  });
}

export interface AuditRow {
  id: number;
  at: Date;
  actorEmail: string | null;
  app: string | null;
  event: string;
  targetEmail: string | null;
  restaurantId: string | null;
  detail: unknown;
}

/** The audit log, newest first, optionally narrowed to one person or event. Read-only. */
export async function readAudit(db: Conn, opts: { q?: string; event?: string; limit?: number; before?: number } = {}) {
  const where: SQL[] = [];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(audit.actorEmail, like), ilike(audit.targetEmail, like), ilike(audit.restaurantId, like))!);
  }
  if (opts.event) where.push(eq(audit.event, opts.event));
  if (opts.before) where.push(sql`${audit.id} < ${opts.before}`);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = (await db
    .select()
    .from(audit)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(audit.id))
    .limit(limit)) as AuditRow[];
  const [{ n }] = (await db.select({ n: count() }).from(audit)) as [{ n: number }];
  return { rows, total: Number(n) };
}
