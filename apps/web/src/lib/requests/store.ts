import 'server-only';
import { admins, appMembers, audit, notifications, permissionRoles, personStores, restaurants, users, type Db } from '@hub/db';
import type { Role } from '@hub/rbac';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { AccessStore } from './service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * AccessStore on Postgres. Everything the rules in service.ts need, and nothing else.
 *
 * person_stores is the one table rows are deleted from: a store grant IS a row (a
 * blank never grants), so taking a store away removes it. The before and after are in
 * the audit. Memberships and people are never deleted.
 */
export function pgAccessStore(db: Db | Tx, inTransaction = false): AccessStore {
  const member = (app: string, email: string) => and(eq(appMembers.app, app), eq(appMembers.email, email));
  const self: AccessStore = {
    async transaction(fn) {
      if (inTransaction) return fn(self);
      return (db as Db).transaction((tx) => fn(pgAccessStore(tx, true)));
    },

    async findMember(app, email) {
      const [row] = await db
        .select({ status: appMembers.status, notifiedOn: appMembers.notifiedOn, grantedAt: appMembers.grantedAt })
        .from(appMembers)
        .where(member(app, email))
        .for('update');
      return row ?? null;
    },

    async findAccess(email) {
      const [row] = await db.select({ role: users.role }).from(users).where(eq(users.email, email)).for('update');
      const stores = await db.select({ id: personStores.restaurantId }).from(personStores).where(eq(personStores.email, email));
      return { role: row?.role ?? null, stores: stores.map((s) => s.id).sort() };
    },

    async heldApps(email) {
      const rows = await db
        .select({ app: appMembers.app })
        .from(appMembers)
        .where(and(eq(appMembers.email, email), eq(appMembers.status, 'active')));
      return rows.map((r) => r.app).sort();
    },

    async setAccess(email, role, stores) {
      await db.update(users).set({ role }).where(eq(users.email, email));
      const where = eq(personStores.email, email);
      await db.delete(personStores).where(stores.length ? and(where, notInArray(personStores.restaurantId, stores)) : where);
      if (stores.length) {
        await db
          .insert(personStores)
          .values(stores.map((restaurantId) => ({ email, restaurantId })))
          .onConflictDoNothing();
      }
    },

    async findUser(email) {
      const [row] = await db
        .select({
          fullName: users.fullName,
          hrEmail: users.hrEmail,
          employeeNumber: users.employeeNumber,
          clearviewStore: users.clearviewStore,
          active: users.active,
        })
        .from(users)
        .where(eq(users.email, email));
      return row ?? null;
    },

    async insertUser(email, row) {
      await db.insert(users).values({ email, ...row });
    },

    async fillUserBlanks(email, fields) {
      // One statement per field, each only where that field is still null.
      const columns = { fullName: users.fullName, hrEmail: users.hrEmail, employeeNumber: users.employeeNumber, clearviewStore: users.clearviewStore };
      for (const [k, v] of Object.entries(fields) as [keyof typeof columns, string | null][]) {
        if (v == null) continue;
        await db.update(users).set({ [k]: v }).where(and(eq(users.email, email), isNull(columns[k])));
      }
    },

    async setUserActive(email) {
      await db.update(users).set({ active: true }).where(eq(users.email, email));
    },

    async insertMember(app, email, row) {
      await db.insert(appMembers).values({ app, email, status: row.status });
    },

    async updateMember(app, email, patch) {
      await db
        .update(appMembers)
        .set({ ...patch, lastModified: sql`now()` })
        .where(member(app, email));
    },

    async restaurants() {
      return db.select({ id: restaurants.restaurantId, name: restaurants.name, active: restaurants.active }).from(restaurants);
    },

    async rolesFor(app) {
      const rows = await db.selectDistinct({ role: permissionRoles.role }).from(permissionRoles).where(eq(permissionRoles.app, app));
      return rows.map((r) => r.role as Role);
    },

    async notifyAdmins() {
      const rows = await db.select({ email: admins.email }).from(admins).where(eq(admins.notify, true));
      return rows.map((r) => r.email);
    },

    async audit(entry) {
      await db.insert(audit).values(entry);
    },

    async notify(entry) {
      await db.insert(notifications).values(entry);
    },
  };
  return self;
}
