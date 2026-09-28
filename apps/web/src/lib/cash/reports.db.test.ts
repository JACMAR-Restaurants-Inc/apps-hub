/**
 * The report queue against REAL Postgres (staging), rolled back, with the file store
 * and Gmail replaced by stand-ins. Skipped in CI.
 */

import { existsSync } from 'node:fs';
import { createDb, reportEmails, reportJobs, safeCounts } from '@hub/db';
import type { Message } from '@hub/email';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { FileStore } from './files';
import type { CountInput } from './math';
import { dueJobs, runReportJob, type ReportDeps } from './reports';
import { queueAccountantSend, readSetup, saveCount, type Conn } from './store';

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

const RID = '1647';
function memoryFiles(): FileStore & { saved: Map<string, Uint8Array> } {
  const saved = new Map<string, Uint8Array>();
  return {
    saved,
    async put(path, bytes) {
      saved.set(path, bytes);
      return `supabase:${path}`;
    },
    async get(ref) {
      const b = saved.get(ref.replace('supabase:', ''));
      return b ? { bytes: b, contentType: 'application/pdf' } : null;
    },
    async remove(ref) {
      saved.delete(ref.replace('supabase:', ''));
    },
  };
}

async function fileOne(tx: Conn, sendToAccountant = false) {
  const setup = (await readSetup(tx, RID))!;
  const input: CountInput = {
    restaurantId: RID,
    comments: '',
    tills: setup.tills.map((t) => ({ tillNumber: t.tillNumber, countedCents: t.baseAmountCents, fixed: false })),
    coins: [],
    paper: [],
    pettyCash: [],
    sendToAccountant,
    attachmentIds: [],
  };
  const out = await saveCount(tx, { input, email: 'r@example.invalid', name: 'Test', language: 'fr', now: new Date(), sendToAccountant });
  if (!out.ok) throw new Error(out.error);
  return out;
}

const deps = (tx: Conn, send: ReportDeps['send'], files = memoryFiles()): ReportDeps & { files: ReturnType<typeof memoryFiles> } => ({
  db: tx,
  files,
  send,
  accountantEmail: 'compta@example.com',
  reportOverride: 'owner@example.com',
  restaurantName: async () => 'Hull',
});

describe.skipIf(!db)('report queue on Postgres (rolled back)', () => {
  it('draws and keeps the PDF, emails the restaurant (at the override), records it, and is done', async () => {
    await rolledBack(async (tx) => {
      const { id, jobId } = await fileOne(tx);
      const sent: Message[] = [];
      const d = deps(tx, async (m) => (sent.push(m), { sent: true, id: 'g1', redirected: false }));
      expect(await runReportJob(d, jobId)).toBe('sent');

      const [count] = await tx.select().from(safeCounts).where(eq(safeCounts.id, id));
      expect(count!.pdfUrl).toBe(`supabase:pdfs/${RID}/${id}.pdf`);
      expect(Buffer.from(d.files.saved.get(`pdfs/${RID}/${id}.pdf`)!.slice(0, 5)).toString()).toBe('%PDF-');

      expect(sent.map((m) => m.to)).toEqual([['owner@example.com']]);
      expect(sent[0]!.fromName).toBe('Cash balancing - Jacmar');
      expect(await tx.select().from(reportEmails).where(eq(reportEmails.jobId, jobId))).toMatchObject([{ kind: 'restaurant', status: 'sent', toAddress: 'owner@example.com' }]);
      expect((await tx.select().from(reportJobs).where(eq(reportJobs.id, jobId)))[0]).toMatchObject({ status: 'sent', attempts: 1 });
      // Done is done: running it again does nothing.
      expect(await runReportJob(d, jobId)).toBe('skipped');
    });
  }, 30_000);

  it('with Gmail refusing: recorded as not sent, the job fails, and a retry sends only what did not go', async () => {
    await rolledBack(async (tx) => {
      const { jobId } = await fileOne(tx, true);
      const files = memoryFiles();
      const refuse: ReportDeps['send'] = async () => ({ sent: false, reason: 'token_unauthorized_client' });
      expect(await runReportJob(deps(tx, refuse, files), jobId)).toBe('failed');
      const rows = await tx.select().from(reportEmails).where(eq(reportEmails.jobId, jobId));
      expect(rows.map((r) => [r.kind, r.status, r.error])).toEqual([
        ['restaurant', 'not_sent', 'token_unauthorized_client'],
        ['accountant', 'not_sent', 'token_unauthorized_client'],
      ]);
      expect(rows[1]!.attachmentNames[0]).toMatch(/\.pdf$/);

      // Within the lease nobody else takes it; after it, the retry sends both, the PDF not redrawn.
      expect(await runReportJob(deps(tx, refuse, files), jobId)).toBe('skipped');
      await tx.update(reportJobs).set({ processedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(reportJobs.id, jobId));
      expect(await dueJobs(tx, 1000)).toContain(jobId);
      const sent: string[] = [];
      const pdfsBefore = files.saved.size;
      expect(await runReportJob(deps(tx, async (m) => (sent.push(m.to[0]!), { sent: true, id: 'x', redirected: false }), files), jobId)).toBe('sent');
      expect(sent).toEqual(['owner@example.com', 'compta@example.com']);
      expect(files.saved.size).toBe(pdfsBefore);

      // And once both went, a third run sends nothing more.
      await tx.update(reportJobs).set({ status: 'failed', processedAt: new Date(0) }).where(eq(reportJobs.id, jobId));
      sent.length = 0;
      await runReportJob(deps(tx, async (m) => (sent.push(m.to[0]!), { sent: true, id: 'y', redirected: false }), files), jobId);
      expect(sent).toEqual([]);
    });
  }, 30_000);

  it('no email configured, or no address: recorded with the reason, never guessed', async () => {
    await rolledBack(async (tx) => {
      const { jobId } = await fileOne(tx, true);
      const d = { ...deps(tx, null), accountantEmail: null };
      expect(await runReportJob(d, jobId)).toBe('failed');
      const rows = await tx.select().from(reportEmails).where(eq(reportEmails.jobId, jobId));
      expect(rows.map((r) => [r.kind, r.error])).toEqual([
        ['restaurant', 'email_not_configured'],
        ['accountant', 'no_address'],
      ]);
    });
  }, 30_000);

  it('"send to accounting" afterwards emails the accountant only', async () => {
    await rolledBack(async (tx) => {
      const { id, jobId } = await fileOne(tx);
      const ok: ReportDeps['send'] = async () => ({ sent: true, id: 'z', redirected: false });
      const files = memoryFiles();
      await runReportJob(deps(tx, ok, files), jobId);
      const again = await queueAccountantSend(tx, id, 'fr');
      const sent: string[] = [];
      await runReportJob(deps(tx, async (m) => (sent.push(m.to[0]!), { sent: true, id: 'a', redirected: false }), files), (again as { jobId: number }).jobId);
      expect(sent).toEqual(['compta@example.com']);
    });
  }, 30_000);

  it('the sweep never picks up an old job, like the one imported from April', async () => {
    await rolledBack(async (tx) => {
      const { jobId } = await fileOne(tx);
      await tx.update(reportJobs).set({ status: 'failed', createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(reportJobs.id, jobId));
      expect(await dueJobs(tx, 1000)).not.toContain(jobId);
    });
  });
});
