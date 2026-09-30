/**
 * The beta tester list against REAL Postgres (staging), inside a transaction that is
 * always rolled back. Runs when .env.local has a DATABASE_URL; skipped in CI.
 */

import { existsSync } from 'node:fs';
import { appMembers, audit, betaTesters, createDb, memberStores, notifications, restaurants, users } from '@hub/db';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { deletePerson } from '../admin/settings';
import { addTester, isTester, removeTester, testerOf, testersPage } from './testers';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
// The session pooler: the transaction pooler hangs in long runs (CLAUDE.md §1).
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}
type Tx = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];
const ME = 'sony@jacmar-restaurants.com';
const TESTER = 'beta-tester@example.invalid';
const OFF = 'beta-off@example.invalid';
const LOST = 'beta-lost@example.invalid';
const NONE = 'beta-none@example.invalid';

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}
const lastEvent = async (tx: Tx) => (await tx.select().from(audit).orderBy(desc(audit.id)).limit(1))[0];

/** Four people: an active Gérant in Cash Balancing, one switched off, one whose access was removed, one with none. */
async function people(tx: Tx) {
  const [store] = await tx.select({ id: restaurants.restaurantId }).from(restaurants).where(eq(restaurants.active, true)).limit(1);
  await tx.insert(users).values([
    { email: TESTER, fullName: 'Beta Tester', active: true },
    { email: OFF, active: false },
    { email: LOST, active: true },
    { email: NONE, active: true },
  ]);
  await tx.insert(appMembers).values([
    { app: 'SafeCount', email: TESTER, role: 'manager', status: 'active' },
    { app: 'SafeCount', email: OFF, role: 'manager', status: 'active' },
    { app: 'SafeCount', email: LOST, role: 'manager', status: 'revoked' },
  ]);
  await tx.insert(memberStores).values({ app: 'SafeCount', email: TESTER, restaurantId: store!.id });
  return store!.id;
}

describe.skipIf(!db)('beta testers on Postgres (rolled back)', () => {
  it('adds a tester: the row, the audit of what they test with, and their invitation', async () => {
    await rolledBack(async (tx) => {
      const store = await people(tx);
      expect(await addTester(tx, ME, 'BetaDemo', ' Beta-Tester@Example.invalid ')).toBe('done');
      expect(await isTester(tx, TESTER, 'BetaDemo')).toBe(true);
      expect([...(await testerOf(tx, TESTER))]).toEqual(['BetaDemo']);
      expect(await lastEvent(tx)).toMatchObject({
        event: 'tester_add',
        app: 'BetaDemo',
        actorEmail: ME,
        targetEmail: TESTER,
        detail: { base: 'SafeCount', role: 'manager', stores: [store] },
      });
      const told = await tx.select().from(notifications).where(eq(notifications.email, TESTER));
      expect(told).toMatchObject([{ app: 'BetaDemo', kind: 'testing', readAt: null }]);
      // Their live access is untouched: testing copies nothing.
      expect((await tx.select().from(appMembers).where(eq(appMembers.email, TESTER))).map((m) => m.app)).toEqual(['SafeCount']);

      expect(await addTester(tx, ME, 'BetaDemo', TESTER)).toBe('exists');
    });
  });

  it('refuses whoever could not test: off, removed live, no live access, an admin, a stranger, a live app', async () => {
    await rolledBack(async (tx) => {
      await people(tx);
      expect(await addTester(tx, ME, 'BetaDemo', OFF)).toBe('not_eligible');
      expect(await addTester(tx, ME, 'BetaDemo', LOST)).toBe('not_eligible');
      expect(await addTester(tx, ME, 'BetaDemo', NONE)).toBe('not_eligible');
      expect(await addTester(tx, ME, 'BetaDemo', ME)).toBe('is_admin');
      expect(await addTester(tx, ME, 'BetaDemo', 'nobody@example.invalid')).toBe('not_found');
      expect(await addTester(tx, ME, 'SafeCount', TESTER)).toBe('invalid');
      expect(await addTester(tx, ME, 'BetaDemo', 'not an address')).toBe('invalid');
      // Only these people: staging may hold real testers the owner added by hand.
      const ours = await tx.select().from(betaTesters).where(eq(betaTesters.app, 'BetaDemo'));
      expect(ours.filter((r) => [OFF, LOST, NONE, ME].includes(r.email))).toEqual([]);
    });
  });

  it('removes a tester, audited, telling nobody; a second removal finds nothing', async () => {
    await rolledBack(async (tx) => {
      await people(tx);
      await addTester(tx, ME, 'BetaDemo', TESTER);
      expect(await removeTester(tx, ME, 'BetaDemo', TESTER)).toBe('done');
      expect(await isTester(tx, TESTER, 'BetaDemo')).toBe(false);
      expect(await lastEvent(tx)).toMatchObject({ event: 'tester_remove', app: 'BetaDemo', targetEmail: TESTER, detail: { addedBy: ME } });
      // Only the invitation: removal writes no notification.
      expect(await tx.select().from(notifications).where(eq(notifications.email, TESTER))).toHaveLength(1);
      expect(await removeTester(tx, ME, 'BetaDemo', TESTER)).toBe('not_found');
    });
  });

  it('the admin page: testers with their live role and restaurants; candidates are only who could be added', async () => {
    await rolledBack(async (tx) => {
      const store = await people(tx);
      const before = (await testersPage(tx)).find((b) => b.key === 'BetaDemo')!;
      const candidates = before.candidates.map((c) => c.email);
      expect(candidates).toContain(TESTER);
      for (const e of [OFF, LOST, NONE, ME]) expect(candidates).not.toContain(e);

      await addTester(tx, ME, 'BetaDemo', TESTER);
      const after = (await testersPage(tx)).find((b) => b.key === 'BetaDemo')!;
      expect(after.testers.find((x) => x.email === TESTER)).toMatchObject({ fullName: 'Beta Tester', status: 'active', role: 'manager', stores: [store], addedBy: ME });
      expect(after.candidates.map((c) => c.email)).not.toContain(TESTER);

      // Their live access removed afterwards: still listed, so the admin sees why they cannot test.
      await tx.update(appMembers).set({ status: 'revoked' }).where(and(eq(appMembers.app, 'SafeCount'), eq(appMembers.email, TESTER)));
      const lost = (await testersPage(tx)).find((b) => b.key === 'BetaDemo')!;
      expect(lost.testers.find((x) => x.email === TESTER)?.status).toBe('revoked');
    });
  });

  it('deleting a person takes their tester rows too, and the journal keeps which betas', async () => {
    await rolledBack(async (tx) => {
      await people(tx);
      await addTester(tx, ME, 'BetaDemo', TESTER);
      expect(await deletePerson(tx, ME, TESTER, TESTER)).toBe('done');
      expect(await tx.select().from(betaTesters).where(eq(betaTesters.email, TESTER))).toEqual([]);
      expect(await lastEvent(tx)).toMatchObject({ event: 'person_deleted', targetEmail: TESTER, detail: { testing: ['BetaDemo'] } });
    });
  });
});
