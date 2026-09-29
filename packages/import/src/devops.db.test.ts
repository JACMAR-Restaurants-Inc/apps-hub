/** JM DevOps' import against REAL Postgres (staging), always rolled back. Skipped in CI. */

import { existsSync } from 'node:fs';
import { comments, createDb, events, issues, projects, type Db } from '@hub/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadDevops, verifyDevops, type DevopsProject } from './devops';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});
class Rollback extends Error {}
async function rolledBack(fn: (tx: Db) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx as unknown as Db);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const ADMINS = [{ email: 'admin-test@example.invalid', fullName: 'Testeur Admin' }];
const plan = (): DevopsProject[] => [
  {
    name: 'Import test',
    prefix: 'ZZIMP',
    githubRepo: null,
    issues: [
      { number: 3, title: 'Three', type: 'bug', status: 'active', priority: 'high', assigneeText: 'Testeur', requestedBy: 'HR', description: 'd', createdOn: '2026-06-22', dueDate: '2026-07-01', notes: 'A note' },
      { number: 66, title: 'Sixty-six', type: 'task', status: 'completed', priority: 'low', assigneeText: 'Teammate A', requestedBy: null, description: '', createdOn: '2026-06-23', dueDate: null, notes: null },
    ],
  },
];

describe.skipIf(!db)('JM DevOps import on Postgres (rolled back)', () => {
  it('imports, verifies, and a second run changes nothing', async () => {
    await rolledBack(async (tx) => {
      await loadDevops(tx, plan(), ADMINS);
      await loadDevops(tx, plan(), ADMINS);
      const report = await verifyDevops(tx, plan(), ADMINS);
      expect(report.failures).toEqual([]);

      const [p] = await tx.select().from(projects).where(eq(projects.prefix, 'ZZIMP'));
      expect(p!.nextNumber).toBe(67);
      const rows = await tx.select().from(issues).where(eq(issues.projectId, p!.id));
      expect(rows).toHaveLength(2);
      const three = rows.find((r) => r.number === 3)!;
      // "Testeur" is exactly one admin's first name; "Teammate A" is nobody's.
      expect([three.assigneeEmail, three.assigneeText, three.createdBy]).toEqual(['admin-test@example.invalid', null, null]);
      expect(rows.find((r) => r.number === 66)!.assigneeText).toBe('Teammate A');
      // The note once, as an authorless comment; one "imported" event per issue.
      expect((await tx.select().from(comments).where(and(eq(comments.issueId, three.id), isNull(comments.authorEmail)))).map((c) => c.body)).toEqual(['A note']);
      expect(await tx.select({ id: events.id }).from(events).where(and(eq(events.issueId, three.id), eq(events.event, 'imported')))).toHaveLength(1);
    });
  });

  it('the verifier catches a changed field and a missing issue', async () => {
    await rolledBack(async (tx) => {
      await loadDevops(tx, plan(), ADMINS);
      const [p] = await tx.select().from(projects).where(eq(projects.prefix, 'ZZIMP'));
      await tx.update(issues).set({ dueDate: '2026-07-02' }).where(and(eq(issues.projectId, p!.id), eq(issues.number, 3)));
      const other = plan();
      other[0]!.issues.push({ ...other[0]!.issues[1]!, number: 70 });
      expect((await verifyDevops(tx, other, ADMINS)).failures).toEqual(['project ZZIMP: next number 67 is not past 70', 'ZZIMP-3 differs from the sheet', 'ZZIMP-70 is missing']);
    });
  });

  it('never moves numbering backwards', async () => {
    await rolledBack(async (tx) => {
      await loadDevops(tx, plan(), ADMINS);
      await tx.update(projects).set({ nextNumber: 90 }).where(eq(projects.prefix, 'ZZIMP'));
      await loadDevops(tx, plan(), ADMINS);
      const [p] = await tx.select().from(projects).where(eq(projects.prefix, 'ZZIMP'));
      expect(p!.nextNumber).toBe(90);
    });
  });
});
