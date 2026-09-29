/**
 * Filing and reading counts against REAL Postgres (staging), inside a transaction that
 * is always rolled back. Runs when .env.local has a DATABASE_URL; skipped in CI.
 */

import { existsSync } from 'node:fs';
import { attachments, countCoins, countPaper, countTills, createDb, reportJobs, safeCounts, tillFixes } from '@hub/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { CountInput } from './math';
import { countDetail, countsOn, previousCounts, queueAccountantSend, readSetup, saveCount, type Conn } from './store';

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

const RID = '3472'; // Aylmer: configured on staging
const ME = 'cash-test@example.invalid';
// Far from any real count: 10:00 in Toronto on 2030-01-15.
const NOW = new Date('2030-01-15T15:00:00Z');

async function draft(tx: Conn, over: Partial<CountInput> = {}): Promise<CountInput> {
  const setup = (await readSetup(tx, RID))!;
  return {
    restaurantId: RID,
    comments: '  Test  ',
    tills: setup.tills.map((t, i) => ({ tillNumber: t.tillNumber, countedCents: t.baseAmountCents - (i === 0 ? 500 : 0), fixed: i === 0 })),
    coins: [{ cents: 25, rolls: 2, loose: 3 }],
    paper: [{ cents: 2000, count: 5 }],
    pettyCash: [{ description: 'Lait', amountCents: 399 }],
    sendToAccountant: false,
    attachmentIds: [],
    ...over,
  };
}
const save = (tx: Conn, input: CountInput, now = NOW, sendToAccountant = false) =>
  saveCount(tx, { input, email: ME, name: 'Test Gérant', language: 'fr', now, sendToAccountant });

describe.skipIf(!db)('cash counts on Postgres (rolled back)', () => {
  it('files a count with every line, stamped by the server in Toronto, and queues its report', async () => {
    await rolledBack(async (tx) => {
      const setup = (await readSetup(tx, RID))!;
      const out = await save(tx, await draft(tx));
      expect(out.ok).toBe(true);
      const id = (out as { id: number }).id;

      const [c] = await tx.select().from(safeCounts).where(eq(safeCounts.id, id));
      expect(c).toMatchObject({ restaurantId: RID, countDate: '2030-01-15', countTime: '10:00:00', comments: 'Test', filedBy: ME, managerName: 'Test Gérant', language: 'fr' });
      const tillsBase = setup.tills.reduce((s, t) => s + t.baseAmountCents, 0);
      expect(c!.tillsTotalCents).toBe(tillsBase - 500);
      expect(c!.coinsTotalCents).toBe(2 * 1000 + 3 * 25);
      expect(c!.paperTotalCents).toBe(10000);
      expect(c!.pettyCashTotalCents).toBe(399);
      expect(c!.grandTotalCents).toBe(tillsBase - 500 + 2075 + 10000 + 399);
      expect(c!.expectedTotalCents).toBe(setup.expectedTotalCents);
      expect(c!.varianceCents).toBe(c!.grandTotalCents - setup.expectedTotalCents);

      expect((await tx.select().from(countTills).where(eq(countTills.safeCountId, id))).length).toBe(setup.tills.length);
      expect((await tx.select().from(countCoins).where(eq(countCoins.safeCountId, id))).length).toBe(5);
      expect((await tx.select().from(countPaper).where(eq(countPaper.safeCountId, id))).length).toBe(5);
      expect(await tx.select().from(tillFixes).where(eq(tillFixes.safeCountId, id))).toMatchObject([
        { tillNumber: setup.tills[0]!.tillNumber, intakeDeltaCents: -500, shortageAmountCents: 500 },
      ]);
      expect(await tx.select().from(reportJobs).where(eq(reportJobs.safeCountId, id))).toMatchObject([{ status: 'pending', sendToAccountant: false, language: 'fr' }]);

      const detail = (await countDetail(tx, id))!;
      expect(detail.countTime).toBe('10:00');
      expect(detail.fixes).toEqual([{ tillNumber: setup.tills[0]!.tillNumber, intakeDeltaCents: -500 }]);
      expect((await countsOn(tx, '2030-01-15', [RID])).map((x) => x.id)).toEqual([id]);
      expect(await countsOn(tx, '2030-01-15', ['1647'])).toEqual([]);
    });
  });

  it('a day’s counts come newest first (owner, 2026-09-29)', async () => {
    await rolledBack(async (tx) => {
      // 9:00 and 14:30 in Toronto (UTC-5 in January), filed in that order.
      const morning = (await save(tx, await draft(tx), new Date('2030-01-15T14:00:00Z'))) as { id: number };
      const afternoon = (await save(tx, await draft(tx), new Date('2030-01-15T19:30:00Z'))) as { id: number };
      expect((await countsOn(tx, '2030-01-15', [RID])).map((x) => x.id)).toEqual([afternoon.id, morning.id]);
    });
  });

  it('a 9 pm count in Toronto is dated that day, though it is already tomorrow in UTC', async () => {
    await rolledBack(async (tx) => {
      const out = await save(tx, await draft(tx), new Date('2030-01-16T02:00:00Z'));
      const [c] = await tx.select().from(safeCounts).where(eq(safeCounts.id, (out as { id: number }).id));
      expect(c).toMatchObject({ countDate: '2030-01-15', countTime: '21:00:00' });
    });
  });

  it('refuses a double tap in the same minute, allows the next minute', async () => {
    await rolledBack(async (tx) => {
      expect((await save(tx, await draft(tx))).ok).toBe(true);
      expect(await save(tx, await draft(tx), new Date(NOW.getTime() + 30_000))).toEqual({ ok: false, error: 'duplicate' });
      expect((await save(tx, await draft(tx), new Date(NOW.getTime() + 60_000))).ok).toBe(true);
    });
  });

  it('refuses a restaurant with no configuration, and bad counts, writing nothing', async () => {
    await rolledBack(async (tx) => {
      const before = (await countsOn(tx, '2030-01-15', [RID])).length;
      expect(await save(tx, await draft(tx, { restaurantId: 'NOPE' }))).toEqual({ ok: false, error: 'not_configured' });
      expect(await save(tx, await draft(tx, { tills: [] }))).toEqual({ ok: false, error: 'tills_mismatch' });
      expect((await countsOn(tx, '2030-01-15', [RID])).length).toBe(before);
    });
  });

  it('links only my own staged uploads at this restaurant; anything else refuses the whole count', async () => {
    await rolledBack(async (tx) => {
      const file = { fileName: 'r.jpg', mimeType: 'image/jpeg', fileSize: 10 };
      const [mine] = await tx.insert(attachments).values({ ...file, restaurantId: RID, uploadedBy: ME }).returning();
      const [theirs] = await tx.insert(attachments).values({ ...file, restaurantId: RID, uploadedBy: 'other@example.invalid' }).returning();
      const [elsewhere] = await tx.insert(attachments).values({ ...file, restaurantId: '1647', uploadedBy: ME }).returning();

      for (const bad of [theirs!, elsewhere!]) {
        expect(await save(tx, await draft(tx, { attachmentIds: [mine!.id, bad.id] }))).toEqual({ ok: false, error: 'attachment_invalid' });
      }
      // Nothing was kept from the refused attempts: my upload is still staged, no count.
      expect((await tx.select().from(attachments).where(eq(attachments.id, mine!.id)))[0]!.safeCountId).toBeNull();
      expect(await countsOn(tx, '2030-01-15', [RID])).toEqual([]);

      const out = await save(tx, await draft(tx, { attachmentIds: [mine!.id] }));
      const id = (out as { id: number }).id;
      expect((await countDetail(tx, id))!.attachments.map((x) => x.id)).toEqual([mine!.id]);
      // Linked once: it cannot be moved onto another count.
      expect(await save(tx, await draft(tx, { attachmentIds: [mine!.id] }), new Date(NOW.getTime() + 60_000))).toEqual({ ok: false, error: 'attachment_invalid' });
    });
  });

  it('previous count: today’s counts, else the last one from any earlier day', async () => {
    await rolledBack(async (tx) => {
      const earlier = await save(tx, await draft(tx), new Date('2030-01-10T15:00:00Z'));
      const none = await previousCounts(tx, RID, '2030-01-15');
      expect(none.today).toEqual([]);
      expect(none.priorDay?.id).toBe((earlier as { id: number }).id);
      expect(none.priorDay?.tills.length).toBeGreaterThan(0);

      const first = await save(tx, await draft(tx));
      const some = await previousCounts(tx, RID, '2030-01-15');
      expect(some.priorDay).toBeNull();
      expect(some.today.map((x) => x.id)).toEqual([(first as { id: number }).id]);
    });
  });

  it('send to accountant: once only, whether asked at filing or afterwards', async () => {
    await rolledBack(async (tx) => {
      const a = (await save(tx, await draft(tx))) as { id: number };
      const first = await queueAccountantSend(tx, a.id, 'fr');
      expect(first.outcome).toBe('done');
      expect(await tx.select().from(reportJobs).where(eq(reportJobs.id, (first as { jobId: number }).jobId))).toMatchObject([{ sendToAccountant: true, restaurantEmail: false }]);
      expect(await queueAccountantSend(tx, a.id, 'fr')).toEqual({ outcome: 'already_sent' });

      const b = (await save(tx, await draft(tx), new Date(NOW.getTime() + 60_000), true)) as { id: number };
      expect(await queueAccountantSend(tx, b.id, 'fr')).toEqual({ outcome: 'already_sent' });
    });
  });
});
