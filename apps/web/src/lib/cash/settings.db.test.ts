/** The Admin page's rules against REAL Postgres (staging), rolled back. Skipped in CI. */

import { existsSync } from 'node:fs';
import { createDb, restaurantSettings, settingsLog, tills } from '@hub/db';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { addTill, adminOverview, cleanEmail, setExpectedTotal, setReportEmail, setTillActive, updateTill } from './settings';
import { readSetup, type Conn } from './store';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});
class Rollback extends Error {}
async function rolledBack(fn: (tx: Conn) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}
const ME = 'admin-test@example.invalid';
const RID = '3472';
const last = async (tx: Conn) => (await tx.select().from(settingsLog).orderBy(desc(settingsLog.id)).limit(1))[0];

describe('cleanEmail', () => {
  it('an address or nothing, never a list or a header', () => {
    expect(cleanEmail(' Hull@Jacmar-Restaurants.com ')).toBe('hull@jacmar-restaurants.com');
    expect(cleanEmail('')).toBe('');
    expect(cleanEmail('a@b.com, c@d.com')).toBeNull();
    expect(cleanEmail('a@b.com\r\nBcc: x@y.z')).toBeNull();
    expect(cleanEmail('not an address')).toBeNull();
  });
});

describe.skipIf(!db)('Admin page on Postgres (rolled back)', () => {
  it('expected total: only from what the page showed, journaled with before and after', async () => {
    await rolledBack(async (tx) => {
      const now = (await adminOverview(tx, [RID])).get(RID)!.expectedTotalCents!;
      expect(await setExpectedTotal(tx, ME, RID, now + 1, 500000)).toBe('changed');
      expect(await setExpectedTotal(tx, ME, RID, now, now)).toBe('unchanged');
      expect(await setExpectedTotal(tx, ME, RID, now, 0)).toBe('invalid');
      expect(await setExpectedTotal(tx, ME, RID, now, 12.5)).toBe('invalid');
      expect(await setExpectedTotal(tx, ME, RID, now, 471000)).toBe('done');
      expect((await readSetup(tx, RID))!.expectedTotalCents).toBe(471000);
      expect(await last(tx)).toMatchObject({ actorEmail: ME, restaurantId: RID, event: 'expected_total', before: String(now), after: '471000' });
    });
  });

  it('a restaurant with no settings gets them from its first expected total', async () => {
    await rolledBack(async (tx) => {
      await tx.delete(restaurantSettings).where(eq(restaurantSettings.restaurantId, RID));
      expect(await setReportEmail(tx, ME, RID, null, 'a@b.com')).toBe('not_found');
      expect(await setExpectedTotal(tx, ME, RID, 450000, 450000)).toBe('changed');
      expect(await setExpectedTotal(tx, ME, RID, null, 450000)).toBe('done');
      expect(await last(tx)).toMatchObject({ event: 'expected_total', before: null, after: '450000' });
    });
  });

  it('report email: an address or none, checked against what was shown', async () => {
    await rolledBack(async (tx) => {
      const shown = (await adminOverview(tx, [RID])).get(RID)!.reportEmail;
      expect(await setReportEmail(tx, ME, RID, shown, 'not an address')).toBe('invalid');
      expect(await setReportEmail(tx, ME, RID, 'someone@else.com', 'x@y.com')).toBe('changed');
      expect(await setReportEmail(tx, ME, RID, shown, ' New@Example.com ')).toBe('done');
      expect((await adminOverview(tx, [RID])).get(RID)!.reportEmail).toBe('new@example.com');
      expect(await setReportEmail(tx, ME, RID, 'new@example.com', '')).toBe('done');
      expect((await adminOverview(tx, [RID])).get(RID)!.reportEmail).toBeNull();
    });
  });

  it('tills: add, rename and rebase from what was shown, retire and restore; never deleted', async () => {
    await rolledBack(async (tx) => {
      expect(await addTill(tx, ME, RID, 1, 'Dup', 15000)).toBe('exists');
      expect(await addTill(tx, ME, RID, 0, 'x', 1)).toBe('invalid');
      expect(await addTill(tx, ME, RID, 42, '  ', 1)).toBe('invalid');
      expect(await addTill(tx, ME, RID, 42, 'Service au volant', 20000)).toBe('done');
      expect((await readSetup(tx, RID))!.tills.map((t) => t.tillNumber)).toContain(42);

      expect(await updateTill(tx, ME, RID, 42, { label: 'Autre', base: 20000 }, { label: 'SAV', base: 25000 })).toBe('changed');
      expect(await updateTill(tx, ME, RID, 42, { label: 'Service au volant', base: 20000 }, { label: 'SAV', base: 25000 })).toBe('done');
      const events = (await tx.select().from(settingsLog).where(and(eq(settingsLog.restaurantId, RID), eq(settingsLog.tillNumber, 42)))).map((e) => [e.event, e.before, e.after]);
      expect(events).toEqual([
        ['till_add', null, 'Service au volant · 20000'],
        ['till_label', 'Service au volant', 'SAV'],
        ['till_base', '20000', '25000'],
      ]);

      expect(await setTillActive(tx, ME, RID, 42, false)).toBe('done');
      expect((await readSetup(tx, RID))!.tills.map((t) => t.tillNumber)).not.toContain(42);
      expect((await tx.select().from(tills).where(and(eq(tills.restaurantId, RID), eq(tills.tillNumber, 42)))).length).toBe(1);
      expect(await setTillActive(tx, ME, RID, 42, false)).toBe('unchanged');
      expect(await setTillActive(tx, ME, RID, 42, true)).toBe('done');
      expect((await readSetup(tx, RID))!.tills.map((t) => t.tillNumber)).toContain(42);
    });
  });
});
