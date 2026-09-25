import 'server-only';
import { admins, appMembers, audit, memberStores, permissionRoles, restaurants, users, type Db } from '@hub/db';
import type { Role } from '@hub/rbac';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { AccessStore } from './service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * AccessStore on Postgres. Everything the rules in service.ts need, and nothing else.
 *
 * member_stores is the one table rows are deleted from: a store grant IS a row (a
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
        .select({ status: appMembers.status, role: appMembers.role, notifiedOn: appMembers.notifiedOn })
        .from(appMembers)
        .where(member(app, email))
        .for('update');
      if (!row) return null;
      const stores = await db
        .select({ id: memberStores.restaurantId })
        .from(memberStores)
        .where(and(eq(memberStores.app, app), eq(memberStores.email, email)));
      return { ...row, stores: stores.map((s) => s.id).sort() };
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
      await db.insert(appMembers).values({ app, email, status: row.status, role: null });
    },

    async updateMember(app, email, patch) {
      await db
        .update(appMembers)
        .set({ ...patch, lastModified: sql`now()` })
        .where(member(app, email));
    },

    async setMemberStores(app, email, stores) {
      const where = and(eq(memberStores.app, app), eq(memberStores.email, email));
      await db.delete(memberStores).where(stores.length ? and(where, notInArray(memberStores.restaurantId, stores)) : where);
      if (stores.length) {
        await db
          .insert(memberStores)
          .values(stores.map((restaurantId) => ({ app, email, restaurantId })))
          .onConflictDoNothing();
      }
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
  };
  return self;
}
