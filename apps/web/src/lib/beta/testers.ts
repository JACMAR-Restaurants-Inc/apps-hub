/**
 * The beta tester list (rbac.beta_testers): reading it, and a system admin adding or
 * removing a tester. Callers have already established the admin (requireSystemAdmin).
 * Tested against Postgres in rolled-back transactions (testers.db.test.ts).
 *
 * Who can be added (checked here under row locks, not only by the page's list): a
 * person on the roster, switched on, not an admin (admins test everything already), who
 * holds the beta's LIVE app right now. Adding copies nothing: their role and
 * restaurants stay the live app's, read on every click (rules.ts).
 */

import { normalizeEmail } from '@hub/core';
import { admins, appMembers, audit, betaTesters, memberStores, notifications, users, type Db } from '@hub/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BETA_APPS, betaApp } from './apps';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export type TesterOutcome = 'done' | 'invalid' | 'not_found' | 'is_admin' | 'not_eligible' | 'exists';

export async function isTester(db: Conn, email: string, betaKey: string): Promise<boolean> {
  const [row] = await db
    .select({ app: betaTesters.app })
    .from(betaTesters)
    .where(and(eq(betaTesters.app, betaKey), eq(betaTesters.email, normalizeEmail(email))))
    .limit(1);
  return Boolean(row);
}

/** The betas this person is on the list of. The page still asks rules.ts who may open them. */
export async function testerOf(db: Conn, email: string): Promise<Set<string>> {
  const rows = await db.select({ app: betaTesters.app }).from(betaTesters).where(eq(betaTesters.email, normalizeEmail(email)));
  return new Set(rows.map((r) => r.app));
}

export interface LivePerson {
  email: string;
  fullName: string | null;
  /** Their access in the live app, as it is now: what they test with. */
  status: 'pending' | 'active' | 'revoked' | null;
  role: string | null;
  stores: string[];
  personActive: boolean;
}

export interface TesterRow extends LivePerson {
  addedAt: Date;
  addedBy: string;
}

/** Everyone holding a live app (any status), with their role and restaurants there. */
async function liveAccess(db: Conn, base: string): Promise<Map<string, LivePerson>> {
  const [rows, stores] = await Promise.all([
    db
      .select({ email: appMembers.email, status: appMembers.status, role: appMembers.role, fullName: users.fullName, personActive: users.active })
      .from(appMembers)
      .innerJoin(users, eq(users.email, appMembers.email))
      .where(eq(appMembers.app, base)),
    db.select({ email: memberStores.email, id: memberStores.restaurantId }).from(memberStores).where(eq(memberStores.app, base)),
  ]);
  const held = new Map<string, string[]>();
  for (const s of stores) held.set(s.email, [...(held.get(s.email) ?? []), s.id].sort());
  return new Map(rows.map((r) => [r.email, { ...r, stores: held.get(r.email) ?? [] }]));
}

/**
 * For the admin's Tests page: each beta's testers, and who could be added (switched on,
 * not an admin, active in the live app, not already testing), both by name.
 */
export async function testersPage(db: Conn) {
  const keys = BETA_APPS.map((b) => b.key);
  const [rows, adminRows] = await Promise.all([
    keys.length
      ? db
          .select({ app: betaTesters.app, email: betaTesters.email, addedAt: betaTesters.addedAt, addedBy: betaTesters.addedBy, fullName: users.fullName, personActive: users.active })
          .from(betaTesters)
          .innerJoin(users, eq(users.email, betaTesters.email))
          .where(inArray(betaTesters.app, keys))
      : Promise.resolve([]),
    db.select({ email: admins.email }).from(admins),
  ]);
  const isAdmin = new Set(adminRows.map((a) => normalizeEmail(a.email)));
  const byName = (a: { fullName: string | null; email: string }, b: { fullName: string | null; email: string }) =>
    (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, 'fr', { sensitivity: 'base' });

  const out = [];
  for (const beta of BETA_APPS) {
    const live = await liveAccess(db, beta.base);
    const testers: TesterRow[] = rows
      .filter((r) => r.app === beta.key)
      .map((r) => ({ ...(live.get(r.email) ?? { status: null, role: null, stores: [] }), email: r.email, fullName: r.fullName, personActive: r.personActive, addedAt: r.addedAt, addedBy: r.addedBy }))
      .sort(byName);
    const testing = new Set(testers.map((x) => x.email));
    const candidates = [...live.values()]
      .filter((p) => p.status === 'active' && p.personActive && !isAdmin.has(normalizeEmail(p.email)) && !testing.has(p.email))
      .sort(byName);
    out.push({ key: beta.key, testers, candidates });
  }
  return out;
}

export async function addTester(db: Conn, admin: string, betaKey: string, rawEmail: string): Promise<TesterOutcome> {
  const beta = betaApp(betaKey);
  const email = normalizeEmail(rawEmail);
  if (!beta || !email.includes('@')) return 'invalid';
  return (db as Db).transaction(async (tx) => {
    // Locked, so the switch or the live access cannot change between the check and the row.
    const [person] = await tx.select({ active: users.active }).from(users).where(eq(users.email, email)).for('share');
    if (!person) return 'not_found';
    const [admin_] = await tx.select({ email: admins.email }).from(admins).where(eq(admins.email, email));
    if (admin_) return 'is_admin';
    const [member] = await tx
      .select({ status: appMembers.status, role: appMembers.role })
      .from(appMembers)
      .where(and(eq(appMembers.app, beta.base), eq(appMembers.email, email)))
      .for('share');
    if (!person.active || member?.status !== 'active') return 'not_eligible';

    const added = await tx.insert(betaTesters).values({ app: beta.key, email, addedBy: admin }).onConflictDoNothing().returning({ app: betaTesters.app });
    if (!added.length) return 'exists';
    const stores = (
      await tx
        .select({ id: memberStores.restaurantId })
        .from(memberStores)
        .where(and(eq(memberStores.app, beta.base), eq(memberStores.email, email)))
        .orderBy(asc(memberStores.restaurantId))
    ).map((s) => s.id);
    // What they will test with, at this moment, for the record.
    await tx.insert(audit).values({ actorEmail: admin, app: beta.key, event: 'tester_add', targetEmail: email, detail: { base: beta.base, role: member.role, stores } });
    // Told in Notifications, in the same transaction. No email: the invitation is
    // the office's, and the bell is where they look.
    await tx.insert(notifications).values({ email, app: beta.key, kind: 'testing', detail: null });
    return 'done';
  });
}

/** Takes effect on their next click. Tells nobody, as removing access does not. */
export async function removeTester(db: Conn, admin: string, betaKey: string, rawEmail: string): Promise<TesterOutcome> {
  const email = normalizeEmail(rawEmail);
  if (!betaApp(betaKey) || !email.includes('@')) return 'invalid';
  return (db as Db).transaction(async (tx) => {
    const gone = await tx
      .delete(betaTesters)
      .where(and(eq(betaTesters.app, betaKey), eq(betaTesters.email, email)))
      .returning({ addedBy: betaTesters.addedBy, addedAt: betaTesters.addedAt });
    if (!gone.length) return 'not_found';
    await tx.insert(audit).values({ actorEmail: admin, app: betaKey, event: 'tester_remove', targetEmail: email, detail: { addedBy: gone[0]!.addedBy, addedAt: gone[0]!.addedAt } });
    return 'done';
  });
}
