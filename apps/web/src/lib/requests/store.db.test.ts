/**
 * The access rules against REAL Postgres (staging), inside a transaction that is always
 * rolled back, so nothing it writes survives. It exists because service.test.ts runs on
 * an in-memory roster, and a fake that behaves differently from the database would let
 * both pass while production breaks (RBAC §80).
 *
 * Runs when .env.local has a DATABASE_URL; skipped in CI, which has no database.
 */

import { existsSync } from 'node:fs';
import { appMembers, audit, createDb, notifications, permissionRoles, permissions, personStores, users } from '@hub/db';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { endAccess, grantAccess, requestAccess, updateAccess, type AccessDeps } from './service';
import { pgAccessStore } from './store';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
// The session pooler, like the other *.db tests: the transaction pooler hangs in long runs (CLAUDE.md §3, database connections).
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}
const EMAIL = 'store-test@example.invalid';
const APP = 'SafeCount';

describe.skipIf(!db)('access rules on Postgres (rolled back)', () => {
  it('request, grant, update, revoke, ask again: every row as the rules say', async () => {
    const mails: string[] = [];
    await expect(
      db!.transaction(async (tx) => {
        const deps: AccessDeps = {
          store: pgAccessStore(tx, true),
          clearview: {
            lookupEmployee: async () => ({
              status: 'found',
              employee: { number: '0014', fullName: 'Test Person', hrEmail: 'hr@example.invalid', active: true, storeNumber: '1647', storeLabel: '1647 - Hull' },
            }),
          },
          send: async (m) => (mails.push(m.subject), { sent: true, id: 'x', redirected: true }),
          urls: { admin: 'https://hub.test/admin', app: (p) => `https://hub.test${p}` },
        };
        const person = async () => (await tx.select().from(users).where(eq(users.email, EMAIL)))[0];
        const membership = async () => (await tx.select().from(appMembers).where(and(eq(appMembers.app, APP), eq(appMembers.email, EMAIL))))[0];
        const stores = async () =>
          (await tx.select({ id: personStores.restaurantId }).from(personStores).where(eq(personStores.email, EMAIL))).map((r) => r.id).sort();

        expect(await requestAccess(deps, EMAIL, APP, '0014')).toBe('pending');
        expect(await person()).toMatchObject({ active: false, fullName: 'Test Person', employeeNumber: '0014', clearviewStore: '1647', addedBy: 'self-service request' });
        expect(await membership()).toMatchObject({ status: 'pending', notifiedOn: null, grantedAt: null });
        expect((await person())!.role).toBeNull();
        expect(await requestAccess(deps, EMAIL, APP, '0014')).toBe('duplicate');

        expect(await grantAccess(deps, 'sony@jacmar-restaurants.com', APP, EMAIL, 'office', ['1647', '3472'])).toBe('done');
        expect((await person())!.active).toBe(true);
        expect(await membership()).toMatchObject({ status: 'active', grantedBy: 'sony@jacmar-restaurants.com' });
        expect((await membership())!.grantedAt).toBeInstanceOf(Date);
        expect((await person())!.role).toBe('office');
        expect(await stores()).toEqual(['1647', '3472']);
        expect(mails).toEqual(['Demande d’accès à Cash Balancing : store-test@example.invalid', 'Vous avez maintenant accès à Cash Balancing']);

        expect(await updateAccess(deps, 'sony@jacmar-restaurants.com', APP, EMAIL, 'viewer', ['3472'])).toBe('done');
        expect(await stores()).toEqual(['3472']);

        expect(await endAccess(deps, 'sony@jacmar-restaurants.com', APP, EMAIL, 'active')).toBe('done');
        expect(await membership()).toMatchObject({ status: 'revoked' });
        expect((await person())!.role).toBe('viewer');
        expect(await stores()).toEqual(['3472']); // kept as the record; revoked grants nothing
        expect(await grantAccess(deps, 'sony@jacmar-restaurants.com', APP, EMAIL, 'manager', ['1647'])).toBe('changed');

        expect(await requestAccess(deps, EMAIL, APP, '0014')).toBe('pending');
        expect(await membership()).toMatchObject({ status: 'pending', notifiedOn: null });

        // In id order, said out loud: without ORDER BY, Postgres returns rows as they lie on
        // disk, and once cleanup reuses the space rolled-back tests leave, that is not the
        // order they were written. It failed this way now and then (2026-09-28).
        const events = (await tx.select({ event: audit.event }).from(audit).where(eq(audit.targetEmail, EMAIL)).orderBy(asc(audit.id))).map((r) => r.event);
        expect(events).toEqual(['request', 'notify', 'request', 'grant', 'notify', 'update', 'revoke', 'request', 'notify']);
        // In their Notifications: the grant and the change, not the removal.
        const told = await tx.select({ kind: notifications.kind, detail: notifications.detail }).from(notifications).where(eq(notifications.email, EMAIL)).orderBy(asc(notifications.id));
        expect(told).toEqual([
          { kind: 'granted', detail: { role: 'office', stores: ['1647', '3472'] } },
          { kind: 'changed', detail: { role: 'viewer', stores: ['3472'] } },
        ]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    // Nothing survived.
    expect(await db!.select().from(users).where(eq(users.email, EMAIL))).toEqual([]);
  });

  // One role and one set of restaurants per person, in every app (owner, 2026-10-06).
  it('a second app takes the role and restaurants they already have; a change reaches both', async () => {
    await expect(
      db!.transaction(async (tx) => {
        const deps: AccessDeps = {
          store: pgAccessStore(tx, true),
          clearview: { lookupEmployee: async () => ({ status: 'unavailable', reason: 'not_used' }) },
          send: async () => ({ sent: true, id: 'x', redirected: true }),
          urls: { admin: 'https://hub.test/admin', app: (p) => `https://hub.test${p}` },
        };
        const ADMIN = 'sony@jacmar-restaurants.com';
        // They hold another app as a Gérant at 1647, and ask for Cash Balancing.
        await tx.insert(users).values({ email: EMAIL, active: true, role: 'manager' });
        await tx.insert(personStores).values({ email: EMAIL, restaurantId: '1647' });
        await tx.insert(appMembers).values([
          { app: 'OtherApp', email: EMAIL, status: 'active', grantedAt: new Date() },
          { app: APP, email: EMAIL, status: 'pending' },
        ]);
        const person = async () => (await tx.select({ role: users.role }).from(users).where(eq(users.email, EMAIL)))[0]!.role;
        const stores = async () => (await tx.select({ id: personStores.restaurantId }).from(personStores).where(eq(personStores.email, EMAIL))).map((r) => r.id).sort();

        expect(await grantAccess(deps, ADMIN, APP, EMAIL, 'office', ['1647', '3472'])).toBe('changed');
        expect(await person()).toBe('manager');
        expect(await stores()).toEqual(['1647']);

        expect(await grantAccess(deps, ADMIN, APP, EMAIL, 'manager', ['1647'])).toBe('done');
        const held = await tx.select({ app: appMembers.app }).from(appMembers).where(and(eq(appMembers.email, EMAIL), eq(appMembers.status, 'active'))).orderBy(asc(appMembers.app));
        expect(held.map((r) => r.app)).toEqual(['OtherApp', APP]);

        // OtherApp has no permissions on this database, so it knows no role: a change is refused.
        expect(await updateAccess(deps, ADMIN, APP, EMAIL, 'manager', ['3472'])).toBe('invalid');
        expect(await stores()).toEqual(['1647']);

        // Once it knows the role, the change is the person's: one write, both apps, both told.
        await tx.insert(permissions).values({ app: 'OtherApp', resource: 'app', action: 'access', scope: 'global' });
        await tx.insert(permissionRoles).values({ app: 'OtherApp', resource: 'app', action: 'access', role: 'manager' });
        expect(await updateAccess(deps, ADMIN, APP, EMAIL, 'manager', ['3472'])).toBe('done');
        expect(await stores()).toEqual(['3472']);
        const told = await tx.select({ app: notifications.app }).from(notifications).where(and(eq(notifications.email, EMAIL), eq(notifications.kind, 'changed'))).orderBy(asc(notifications.app));
        expect(told.map((n) => n.app)).toEqual(['OtherApp', APP]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
