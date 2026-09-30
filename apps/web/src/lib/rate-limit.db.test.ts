/**
 * The rate limiter against REAL Postgres (staging), inside a transaction that is always
 * rolled back. Runs when .env.local has a DATABASE_URL; skipped in CI.
 */

import { existsSync } from 'node:fs';
import { audit, createDb, rateLimits } from '@hub/db';
import { asc, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { LIMITS, allow, hit, journalUnderLimit } from './rate-limit';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}
type Tx = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];
async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}
const WHO = 'rate-test@example.invalid';
const T0 = new Date('2026-09-30T12:00:00Z');

describe.skipIf(!db)('rate limits on Postgres (rolled back)', () => {
  it('lets exactly the limit through in a window, says so once, then refuses', async () => {
    await rolledBack(async (tx) => {
      const { max } = LIMITS.accessRequest;
      const gates = [];
      for (let i = 0; i < max + 3; i++) gates.push(await allow(tx, 'accessRequest', WHO, T0));
      expect(gates.map((g) => g.allowed)).toEqual([...Array(max).fill(true), false, false, false]);
      expect(gates.map((g) => g.justTripped)).toEqual([...Array(max).fill(false), true, false, false]);
    });
  });

  it('a new window starts again; another person, or another limit, has its own count', async () => {
    await rolledBack(async (tx) => {
      const { max, windowSeconds } = LIMITS.accessRequest;
      for (let i = 0; i <= max; i++) await allow(tx, 'accessRequest', WHO, T0);
      expect((await allow(tx, 'accessRequest', WHO, T0)).allowed).toBe(false);
      expect((await allow(tx, 'accessRequest', 'someone-else@example.invalid', T0)).allowed).toBe(true);
      expect((await allow(tx, 'noGrantsAudit', WHO, T0)).allowed).toBe(true); // max 5: a shared count would refuse
      expect((await allow(tx, 'accessRequest', WHO, new Date(T0.getTime() + windowSeconds * 1000))).allowed).toBe(true);
    });
  });

  it('ten requests at the same moment, on separate connections, each get their own count', async () => {
    // Outside a transaction on purpose, so the pool's connections really race; its own
    // key, removed afterwards. A read-then-write would hand out duplicate counts here.
    const key = `race:${WHO}:${Date.now()}`;
    try {
      const counts = await Promise.all(Array.from({ length: 10 }, () => hit(db!, key, 3600, T0)));
      expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    } finally {
      await db!.delete(rateLimits).where(like(rateLimits.key, key));
    }
  });

  it('a key keeps no more than a day of windows', async () => {
    await rolledBack(async (tx) => {
      await hit(tx, `t:${WHO}`, 60, T0);
      await hit(tx, `t:${WHO}`, 60, new Date(T0.getTime() + 25 * 3600 * 1000));
      expect(await tx.select().from(rateLimits).where(like(rateLimits.key, `t:${WHO}`))).toHaveLength(1);
    });
  });

  it('refusals fill the journal up to the limit, then ONE rate_limited row, then nothing', async () => {
    await rolledBack(async (tx) => {
      const { max } = LIMITS.denialAudit;
      const row = { actorEmail: WHO, app: 'SafeCount', event: 'denied', detail: { reason: 'no_app_access' } };
      const out = [];
      for (let i = 0; i < max + 5; i++) out.push(await journalUnderLimit(tx, 'denialAudit', row, T0));
      expect(out).toEqual([...Array(max).fill('written'), 'tripped', 'skipped', 'skipped', 'skipped', 'skipped']);
      const events = (await tx.select({ event: audit.event, detail: audit.detail }).from(audit).where(eq(audit.actorEmail, WHO)).orderBy(asc(audit.id))).map((r) => r.event);
      expect(events).toEqual([...Array(max).fill('denied'), 'rate_limited']);
    });
  });
});
