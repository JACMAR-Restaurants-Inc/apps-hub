/** Notifications against REAL Postgres (staging), always rolled back. Skipped in CI. */

import { existsSync } from 'node:fs';
import { createDb, notifications } from '@hub/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { listNotifications, markAllRead, unreadCount } from './notifications';

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

const ME = 'notify-test@example.invalid';
const OTHER = 'other-notify-test@example.invalid';
const day = (d: string) => new Date(`${d}T12:00:00Z`);

describe.skipIf(!db)('Notifications on Postgres (rolled back)', () => {
  it('newest first, counted until read, only the person’s own', async () => {
    await rolledBack(async (tx) => {
      await tx.insert(notifications).values([
        { email: ME, app: 'SafeCount', kind: 'granted', detail: { role: 'manager', stores: ['1647'] }, createdAt: day('2026-09-20') },
        { email: ME, app: 'SafeCount', kind: 'changed', detail: { role: 'viewer', stores: ['1647'] }, createdAt: day('2026-09-25') },
        { email: OTHER, app: 'SafeCount', kind: 'declined', createdAt: day('2026-09-26') },
      ]);
      expect((await listNotifications(tx, ME)).map((n) => n.kind)).toEqual(['changed', 'granted']);
      expect(await unreadCount(tx, ME)).toBe(2);

      await markAllRead(tx, ME, day('2026-09-29'));
      expect(await unreadCount(tx, ME)).toBe(0);
      expect(await unreadCount(tx, OTHER)).toBe(1);
      expect((await listNotifications(tx, ME)).every((n) => n.readAt?.toISOString() === day('2026-09-29').toISOString())).toBe(true);
    });
  });

  it('a read notification goes 30 days after it was read, not before; unread ones stay', async () => {
    await rolledBack(async (tx) => {
      await tx.insert(notifications).values([
        { email: ME, app: 'SafeCount', kind: 'granted', createdAt: day('2026-07-01'), readAt: day('2026-08-01') },
        { email: ME, app: 'SafeCount', kind: 'changed', createdAt: day('2026-07-01'), readAt: day('2026-08-12') },
        { email: ME, app: 'Projects', kind: 'declined', createdAt: day('2026-06-01') },
        { email: OTHER, app: 'SafeCount', kind: 'granted', createdAt: day('2026-07-01'), readAt: day('2026-08-01') },
      ]);
      await markAllRead(tx, ME, day('2026-09-01'));
      // Read on Aug 1: more than 30 days before Sep 1, gone. Read on Aug 12: 20 days, kept. The
      // unread one from June was just read, so it stays for 30 days more.
      expect((await listNotifications(tx, ME)).map((n) => n.kind).sort()).toEqual(['changed', 'declined']);
      // Someone else's are not touched.
      expect(await tx.select().from(notifications).where(eq(notifications.email, OTHER))).toHaveLength(1);
    });
  });
});
