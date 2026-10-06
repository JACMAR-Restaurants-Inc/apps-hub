import 'server-only';
import { appMembers, permissionRoles, personStores, restaurants, users } from '@hub/db';
import type { MemberStatus, Role } from '@hub/rbac';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { APPS } from './apps';

/**
 * Reads for drawing the portal and the admin screen. NOT decisions: what a person may
 * do is can()'s answer, and every action asks it again (authorize / requireSystemAdmin).
 *
 * A role and restaurants are the person's, the same in every app (owner, 2026-10-06).
 * An app row shows them only once that app was granted: on a request or a decline they
 * would read as something the person has there, which they never had.
 */

/** Sorted restaurant ids per person. */
async function storesByPerson(): Promise<Map<string, string[]>> {
  const rows = await db().select().from(personStores);
  const out = new Map<string, string[]>();
  for (const s of rows) out.set(s.email, [...(out.get(s.email) ?? []), s.restaurantId]);
  for (const v of out.values()) v.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return out;
}

const wasGranted = (m: { status: MemberStatus; grantedAt: Date | null }) => m.status === 'active' || m.grantedAt !== null;

export interface MyApp {
  key: string;
  status: MemberStatus | null;
  /** When the row last changed: for a pending request, the day they asked. */
  since: Date | null;
}

export async function myApps(email: string): Promise<MyApp[]> {
  const rows = await db()
    .select({ app: appMembers.app, status: appMembers.status, since: appMembers.lastModified })
    .from(appMembers)
    .where(eq(appMembers.email, email));
  const byApp = new Map(rows.map((r) => [r.app, r]));
  return APPS.map((a) => ({ key: a.key, status: byApp.get(a.key)?.status ?? null, since: byApp.get(a.key)?.since ?? null }));
}

export interface DirectoryEntry {
  app: string;
  email: string;
  status: MemberStatus;
  role: Role | null;
  /** Set once an admin has acted on the row; on a pending row, it means they are asking again. */
  grantedBy: string | null;
  stores: string[];
  since: Date;
  fullName: string | null;
  hrEmail: string | null;
  employeeNumber: string | null;
  clearviewStore: string | null;
  /** The person's global switch (rbac.users.active). */
  personActive: boolean;
}

export interface Directory {
  /** Newest first: a request that just came in is on top (RBAC §48). */
  requests: DirectoryEntry[];
  /** Everybody else, by name. */
  members: DirectoryEntry[];
  restaurants: { id: string; name: string; active: boolean }[];
  rolesByApp: Record<string, Role[]>;
}

export async function directory(): Promise<Directory> {
  const [rows, stores, restaurantRows, roleRows] = await Promise.all([
    db()
      .select({
        app: appMembers.app,
        email: appMembers.email,
        status: appMembers.status,
        role: users.role,
        grantedBy: appMembers.grantedBy,
        grantedAt: appMembers.grantedAt,
        since: appMembers.lastModified,
        fullName: users.fullName,
        hrEmail: users.hrEmail,
        employeeNumber: users.employeeNumber,
        clearviewStore: users.clearviewStore,
        personActive: users.active,
      })
      .from(appMembers)
      .innerJoin(users, eq(users.email, appMembers.email))
      .orderBy(desc(appMembers.lastModified)),
    storesByPerson(),
    db().select({ id: restaurants.restaurantId, name: restaurants.name, active: restaurants.active }).from(restaurants).orderBy(asc(restaurants.restaurantId)),
    db().selectDistinct({ app: permissionRoles.app, role: permissionRoles.role }).from(permissionRoles),
  ]);

  const entries: DirectoryEntry[] = rows.map(({ grantedAt, ...r }) =>
    wasGranted({ status: r.status, grantedAt }) ? { ...r, stores: stores.get(r.email) ?? [] } : { ...r, role: null, stores: [] },
  );

  // Accents and case ignored; the address stands in for somebody with no name.
  const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
    (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, 'fr', { sensitivity: 'base' });

  const order = ['office', 'manager', 'viewer'] as const;
  const rolesByApp: Record<string, Role[]> = {};
  for (const r of roleRows) (rolesByApp[r.app] ??= []).push(r.role);
  for (const k of Object.keys(rolesByApp)) rolesByApp[k]!.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return {
    requests: entries.filter((e) => e.status === 'pending'),
    members: entries.filter((e) => e.status !== 'pending').sort(byName),
    restaurants: restaurantRows,
    rolesByApp,
  };
}

export interface PersonApp {
  key: string;
  name: string;
  nameFr: string;
  status: MemberStatus | null;
  role: Role | null;
  stores: string[];
  since: Date | null;
}

export interface Person {
  email: string;
  fullName: string | null;
  hrEmail: string | null;
  employeeNumber: string | null;
  clearviewStore: string | null;
  active: boolean;
  isAdmin: boolean;
  addedAt: Date;
  addedBy: string | null;
  /** Their role and restaurants, the same in every app they hold. Null before any grant. */
  role: Role | null;
  stores: string[];
  /** One entry per governed app, row or not. */
  apps: PersonApp[];
}

/**
 * The access directory (§48/§59): everybody on the roster, one entry each, with every
 * governed app whether they have a row for it or not. People waiting on a request come
 * first, newest on top; everybody else by name, accents and case ignored, the address
 * standing in for a missing name. Decided here, on the server, so every render agrees.
 */
export async function people(isAdmin: (email: string) => boolean): Promise<Person[]> {
  const [userRows, memberRows, stores] = await Promise.all([
    db().select().from(users),
    db().select().from(appMembers),
    storesByPerson(),
  ]);
  const rows = new Map(memberRows.map((m) => [`${m.app}|${m.email}`, m]));

  const list: Person[] = userRows.map((u) => ({
    email: u.email,
    fullName: u.fullName,
    hrEmail: u.hrEmail,
    employeeNumber: u.employeeNumber,
    clearviewStore: u.clearviewStore,
    active: u.active,
    isAdmin: isAdmin(u.email),
    addedAt: u.addedAt,
    addedBy: u.addedBy,
    role: u.role,
    stores: stores.get(u.email) ?? [],
    apps: APPS.map((a) => {
      const m = rows.get(`${a.key}|${u.email}`);
      const shown = m && wasGranted(m);
      return {
        key: a.key,
        name: a.name.en,
        nameFr: a.name.fr,
        status: m?.status ?? null,
        role: shown ? u.role : null,
        stores: shown ? (stores.get(u.email) ?? []) : [],
        since: m?.lastModified ?? null,
      };
    }),
  }));

  const waitingSince = (p: Person) =>
    Math.max(-1, ...p.apps.filter((a) => a.status === 'pending' && a.since).map((a) => a.since!.getTime()));
  const name = (p: Person) => p.fullName ?? p.email;
  return list.sort(
    (a, b) => waitingSince(b) - waitingSince(a) || name(a).localeCompare(name(b), 'fr', { sensitivity: 'base' }),
  );
}
