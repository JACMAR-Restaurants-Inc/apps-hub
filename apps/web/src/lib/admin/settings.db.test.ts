/**
 * The spreadsheet-replacing rules against REAL Postgres (staging), inside a transaction
 * that is always rolled back. Runs when .env.local has a DATABASE_URL; skipped in CI.
 */

import { existsSync } from 'node:fs';
import { admins, audit, createDb, restaurants, users } from '@hub/db';
import { desc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { addAdmin, addRestaurant, readAudit, removeAdmin, setAdminNotify, setPersonActive, setRestaurantActive, settingsPageData } from './settings';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
// The session pooler: the transaction pooler hangs in long runs (CLAUDE.md §1).
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}
const ME = 'sony@jacmar-restaurants.com';
const NEW = 'settings-test@example.invalid';

async function rolledBack(fn: (tx: Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0]) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}
const lastEvent = async (tx: Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0]) =>
  (await tx.select().from(audit).orderBy(desc(audit.id)).limit(1))[0];

describe.skipIf(!db)('settings on Postgres (rolled back)', () => {
  it('the Administration page: admins with their name and notify, restaurants by number', async () => {
    await rolledBack(async (tx) => {
      await addRestaurant(tx, ME, '99999', 'Test Last');
      await addRestaurant(tx, ME, '999', 'Test First');
      const data = await settingsPageData(tx);
      expect(data.admins.map((a) => a.email)).toContain(ME);
      expect(data.admins.every((a) => typeof a.notify === 'boolean')).toBe(true);
      const ids = data.restaurants.map((r) => r.id);
      // Numeric order: 999 before 1647 before 99999, not as text.
      expect(ids.indexOf('999')).toBe(0);
      expect(ids.at(-1)).toBe('99999');
      expect(ids).toEqual([...ids].sort((a, b) => Number(a) - Number(b)));
    });
  });

  it('admins: add a new person, notify, cannot remove yourself or the last one', async () => {
    await rolledBack(async (tx) => {
      expect(await addAdmin(tx, ME, ' Settings-Test@Example.invalid ', 'Test Person')).toBe('done');
      expect((await tx.select().from(users).where(eq(users.email, NEW)))[0]).toMatchObject({ active: true, fullName: 'Test Person', addedBy: ME });
      expect((await tx.select().from(admins).where(eq(admins.email, NEW)))[0]).toMatchObject({ notify: false, addedBy: ME });
      expect(await lastEvent(tx)).toMatchObject({ event: 'admin_add', actorEmail: ME, targetEmail: NEW });
      expect(await addAdmin(tx, ME, NEW)).toBe('exists');
      expect(await addAdmin(tx, ME, 'not an address')).toBe('invalid');

      expect(await setAdminNotify(tx, ME, NEW, true)).toBe('done');
      expect(await setAdminNotify(tx, ME, NEW, true)).toBe('unchanged');
      expect((await tx.select().from(admins).where(eq(admins.email, NEW)))[0]!.notify).toBe(true);

      expect(await removeAdmin(tx, ME, ME)).toBe('self');
      expect(await removeAdmin(tx, ME, NEW)).toBe('done');
      expect(await tx.select().from(admins).where(eq(admins.email, NEW))).toEqual([]);
      expect(await lastEvent(tx)).toMatchObject({ event: 'admin_remove', targetEmail: NEW });
      // The person stays on the roster: removing a role is not removing a person.
      expect((await tx.select().from(users).where(eq(users.email, NEW))).length).toBe(1);

      // Down to one admin: that one cannot be removed, by anybody.
      const others = (await tx.select().from(admins)).map((a) => a.email).filter((e) => e !== ME);
      for (const e of others) await tx.delete(admins).where(eq(admins.email, e));
      expect(await removeAdmin(tx, 'someone@else.com', ME)).toBe('last_admin');
    });
  });

  it('kill switch: off and on for someone else, never for yourself, audited', async () => {
    await rolledBack(async (tx) => {
      await tx.insert(users).values({ email: NEW, active: true });
      expect(await setPersonActive(tx, ME, NEW, false)).toBe('done');
      expect((await tx.select().from(users).where(eq(users.email, NEW)))[0]!.active).toBe(false);
      expect(await lastEvent(tx)).toMatchObject({ event: 'user_active', targetEmail: NEW, detail: { before: true, after: false } });
      expect(await setPersonActive(tx, ME, NEW, false)).toBe('unchanged');
      expect(await setPersonActive(tx, ME, NEW, true)).toBe('done');
      expect(await setPersonActive(tx, ME, ME, false)).toBe('self');
      expect(await setPersonActive(tx, ME, 'nobody@example.invalid', false)).toBe('not_found');
    });
  });

  it('restaurants: added closed, opened and closed on purpose, never duplicated', async () => {
    await rolledBack(async (tx) => {
      expect(await addRestaurant(tx, ME, ' 99991 ', ' Test Store ')).toBe('done');
      expect((await tx.select().from(restaurants).where(eq(restaurants.restaurantId, '99991')))[0]).toMatchObject({ name: 'Test Store', active: false });
      expect(await addRestaurant(tx, ME, '99991', 'Again')).toBe('exists');
      expect(await addRestaurant(tx, ME, 'ALL', 'Pseudo')).toBe('invalid');
      expect(await addRestaurant(tx, ME, '12345', '  ')).toBe('invalid');
      expect(await setRestaurantActive(tx, ME, '99991', true)).toBe('done');
      expect(await setRestaurantActive(tx, ME, '99991', true)).toBe('unchanged');
      expect(await lastEvent(tx)).toMatchObject({ event: 'restaurant_active', restaurantId: '99991', detail: { before: false, after: true } });
      expect(await setRestaurantActive(tx, ME, 'nope', false)).toBe('not_found');
    });
  });

  it('the audit log reads newest first, filters by person or event, and escapes the filter', async () => {
    await rolledBack(async (tx) => {
      await addRestaurant(tx, ME, '99992', 'Audit Store');
      const { rows, total } = await readAudit(tx, { q: '99992' });
      expect(rows[0]).toMatchObject({ event: 'restaurant_add', restaurantId: '99992' });
      expect(total).toBeGreaterThan(0);
      expect((await readAudit(tx, { event: 'restaurant_add', limit: 1 })).rows).toHaveLength(1);
      // A % in the filter is a character, not a wildcard.
      expect((await readAudit(tx, { q: '%' })).rows.every((r) => JSON.stringify(r).includes('%'))).toBe(true);
    });
  });
});

describe('what the portal may do', () => {
  it('opens a restaurant, but never closes one (owner, 2026-09-25)', async () => {
    const { portalAllows } = await import('./settings');
    expect(portalAllows('restaurant_active', true)).toBe(true);
    expect(portalAllows('restaurant_active', false)).toBe(false);
    // Everything else it offers stays allowed, both ways.
    expect(portalAllows('person_active', false)).toBe(true);
    expect(portalAllows('admin_notify', false)).toBe(true);
  });
});

describe.skipIf(!db)('deleting a person (rolled back)', () => {
  it('removes them, their access and their sign-in, and keeps a copy in the journal', async () => {
    const { deletePerson } = await import('./settings');
    const { appMembers, memberStores, authUsers, authSessions, authAccounts } = await import('@hub/db');
    await rolledBack(async (tx) => {
      await tx.insert(users).values({ email: NEW, active: true, fullName: 'Test Person', employeeNumber: '0014' });
      await tx.insert(appMembers).values({ app: 'SafeCount', email: NEW, status: 'active', role: 'manager' });
      await tx.insert(memberStores).values({ app: 'SafeCount', email: NEW, restaurantId: '1647' });
      await tx.insert(authUsers).values({ id: 'del-test', name: 'Test', email: 'Settings-Test@Example.invalid', emailVerified: true });
      await tx.insert(authSessions).values({ id: 'del-s', token: 'del-token', userId: 'del-test', expiresAt: new Date(Date.now() + 60_000) });
      await tx.insert(authAccounts).values({ id: 'del-a', accountId: 'g-del', providerId: 'google', userId: 'del-test' });

      expect(await deletePerson(tx, ME, NEW, 'wrong@example.invalid')).toBe('mismatch');
      expect((await tx.select().from(users).where(eq(users.email, NEW))).length).toBe(1);

      expect(await deletePerson(tx, ME, NEW, ' Settings-Test@Example.invalid ')).toBe('done');
      expect(await tx.select().from(users).where(eq(users.email, NEW))).toEqual([]);
      expect(await tx.select().from(appMembers).where(eq(appMembers.email, NEW))).toEqual([]);
      expect(await tx.select().from(memberStores).where(eq(memberStores.email, NEW))).toEqual([]);
      expect(await tx.select().from(authUsers).where(eq(authUsers.id, 'del-test'))).toEqual([]);
      expect(await tx.select().from(authSessions).where(eq(authSessions.id, 'del-s'))).toEqual([]);

      const entry = await lastEvent(tx);
      expect(entry).toMatchObject({ event: 'person_deleted', actorEmail: ME, targetEmail: NEW });
      expect(entry!.detail).toMatchObject({
        person: { fullName: 'Test Person', employeeNumber: '0014', active: true },
        apps: [{ app: 'SafeCount', status: 'active', role: 'manager', stores: ['1647'] }],
        signedOut: true,
      });
      expect(await deletePerson(tx, ME, NEW, NEW)).toBe('not_found');
    });
  });

  it('never an admin, never yourself', async () => {
    const { deletePerson } = await import('./settings');
    await rolledBack(async (tx) => {
      const [anAdmin] = await tx.select().from(admins).where(eq(admins.email, 'pierrej@jacmar-restaurants.com'));
      expect(anAdmin).toBeDefined();
      expect(await deletePerson(tx, ME, anAdmin!.email, anAdmin!.email)).toBe('is_admin');
      expect(await deletePerson(tx, ME, ME, ME)).toBe('self');
      expect((await tx.select().from(users).where(eq(users.email, anAdmin!.email))).length).toBe(1);
    });
  });
});

describe.skipIf(!db)('favourites (rolled back)', () => {
  it('star only what you may see; unstar; deleting the person removes their stars', async () => {
    const { setFavourite, listFavourites } = await import('../favourites');
    const { deletePerson } = await import('./settings');
    const { favourites } = await import('@hub/db');
    await rolledBack(async (tx) => {
      expect(await setFavourite(tx, NEW, false, 'SafeCount', true)).toBe('done');
      expect(await setFavourite(tx, NEW, false, 'Fujitsu', true)).toBe('done');
      expect(await setFavourite(tx, NEW, false, 'SafeCount', true)).toBe('done'); // twice is once
      // Admin-only for a non-admin, and an app that does not exist: refused.
      expect(await setFavourite(tx, NEW, false, 'GitHub', true)).toBe('invalid');
      expect(await setFavourite(tx, NEW, false, 'NoSuchApp', true)).toBe('invalid');
      expect(await setFavourite(tx, NEW, true, 'GitHub', true)).toBe('done');
      expect(await listFavourites(tx, NEW)).toEqual(['SafeCount', 'Fujitsu', 'GitHub']);
      expect(await setFavourite(tx, NEW, false, 'Fujitsu', false)).toBe('done');
      expect(await listFavourites(tx, NEW)).toEqual(['SafeCount', 'GitHub']);

      await tx.insert(users).values({ email: NEW, active: true });
      expect(await deletePerson(tx, ME, NEW, NEW)).toBe('done');
      expect(await tx.select().from(favourites).where(eq(favourites.email, NEW))).toEqual([]);
      expect((await lastEvent(tx))!.detail).toMatchObject({ favourites: ['SafeCount', 'GitHub'] });
    });
  });
});
