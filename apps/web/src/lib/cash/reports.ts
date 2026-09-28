/**
 * The report queue (Reports.gs processReportQueue): for each count, its PDF, then its
 * emails. A job is queued in the same transaction as its count (saveCount), run right
 * after the count is filed, and retried by the scheduled sweep until it is sent.
 *
 * Differences from the old queue:
 * - A failed job is retried (the old one never was), up to MAX_ATTEMPTS. Until Gmail
 *   is authorised, every email fails; once it is, the waiting reports go out on the
 *   next sweep with nobody touching anything. An admin can also retry from Rapports.
 * - Every email is recorded, sent or not (cash.report_emails): the Rapports page.
 * - An email already sent is never sent again when its job is retried.
 * - Nothing here can be reached without the cron secret or a signed-in admin.
 */

import { attachments, reportEmails, reportJobs, restaurantSettings, safeCounts } from '@hub/db';
import type { Attachment, Message, SendResult } from '@hub/email';
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FileStore } from './files';
import { planReportEmails, SENDER_NAME } from './report-emails';
import { renderReportPdf } from './report-pdf';
import { countDetail, type Conn } from './store';

export const MAX_ATTEMPTS = 8;
/** The accountant email drops the photos above this, keeping the PDF (Reports.gs: 20 MB). */
const MAX_EMAIL_BYTES = 20 * 1024 * 1024;

export interface ReportDeps {
  db: Conn;
  files: FileStore;
  /** Null when email is not configured at all: every email is recorded as not sent. */
  send: ((m: Message) => Promise<SendResult>) | null;
  /** ACCOUNTANT_EMAIL (the old CB_ACCOUNTANT_EMAIL Script Property). */
  accountantEmail: string | null;
  /** REPORT_EMAIL_OVERRIDE: on staging, every restaurant's report goes here instead (CLAUDE.md §4). */
  reportOverride: string | null;
  restaurantName: (id: string) => Promise<string>;
}

export type JobOutcome = 'sent' | 'failed' | 'skipped';

/** Runs one job, if nobody else is running it. */
export async function runReportJob(deps: ReportDeps, jobId: number): Promise<JobOutcome> {
  // The claim is the lease: a job picked up in the last two minutes is someone else's.
  const [job] = await deps.db
    .update(reportJobs)
    .set({ attempts: sql`${reportJobs.attempts} + 1`, processedAt: sql`now()` })
    .where(
      and(
        eq(reportJobs.id, jobId),
        inArray(reportJobs.status, ['pending', 'failed']),
        or(isNull(reportJobs.processedAt), lt(reportJobs.processedAt, sql`now() - interval '2 minutes'`)),
      ),
    )
    .returning();
  if (!job) return 'skipped';

  try {
    const count = await countDetail(deps.db, job.safeCountId);
    if (!count) throw new Error('count_not_found');
    const lang = job.language === 'en' ? 'en' : 'fr';
    const restaurantName = await deps.restaurantName(count.restaurantId);

    // The count's files, read back from storage.
    const rows = await deps.db
      .select({ fileName: attachments.fileName, mimeType: attachments.mimeType, storagePath: attachments.storagePath })
      .from(attachments)
      .where(eq(attachments.safeCountId, count.id))
      .orderBy(asc(attachments.id));
    const files = await Promise.all(
      rows.map(async (r) => ({ fileName: r.fileName, mimeType: r.mimeType, bytes: r.storagePath ? ((await deps.files.get(r.storagePath).catch(() => null))?.bytes ?? null) : null })),
    );

    // The PDF: made once, kept, reused by a retry or a later "send to accounting".
    let pdf: Uint8Array | null = null;
    const stored = count.pdfUrl && /^(supabase|drive):/.test(count.pdfUrl) ? count.pdfUrl : null;
    if (stored) pdf = (await deps.files.get(stored))?.bytes ?? null;
    if (!pdf) {
      pdf = await renderReportPdf({ count, restaurantName, lang, files });
      const ref = await deps.files.put(`pdfs/${count.restaurantId}/${count.id}.pdf`, pdf, 'application/pdf');
      // An imported count keeps its Drive link; a new one gets the stored PDF.
      if (!count.pdfUrl || stored) await deps.db.update(safeCounts).set({ pdfUrl: ref }).where(eq(safeCounts.id, count.id));
    }
    const pdfName = `decompte-${restaurantName}-${count.countDate}-${count.countTime.replace(':', 'h')}.pdf`.replace(/[^\w.\-àâçéèêëîïôûùüÿæœ]/gi, '_');

    const [settings] = await deps.db.select({ reportEmail: restaurantSettings.reportEmail }).from(restaurantSettings).where(eq(restaurantSettings.restaurantId, count.restaurantId));
    const planned = planReportEmails({
      count,
      restaurantName,
      lang,
      restaurant: { wanted: job.restaurantEmail, address: deps.reportOverride || settings?.reportEmail?.trim() || null },
      accountant: { wanted: job.sendToAccountant, address: deps.accountantEmail },
    });

    const done = await deps.db
      .select({ kind: reportEmails.kind })
      .from(reportEmails)
      .where(and(eq(reportEmails.jobId, job.id), eq(reportEmails.status, 'sent')));
    const alreadySent = new Set(done.map((d) => d.kind));

    const fileAttachments: Attachment[] = files.filter((f) => f.bytes).map((f) => ({ filename: f.fileName, contentType: f.mimeType, bytes: f.bytes! }));
    const reasons: string[] = [];
    for (const email of planned) {
      if (alreadySent.has(email.kind)) continue;
      let list: Attachment[] = email.withPdf ? [{ filename: pdfName, contentType: 'application/pdf', bytes: pdf }, ...fileAttachments] : fileAttachments;
      let text = email.text;
      if (list.reduce((n, a) => n + a.bytes.length, 0) > MAX_EMAIL_BYTES) {
        list = list.slice(0, email.withPdf ? 1 : 0);
        text += lang === 'fr' ? '\n\n(Les pièces jointes étaient trop volumineuses pour ce courriel. Elles sont dans Cash Balancing.)' : '\n\n(The attachments were too large for this email. They are in Cash Balancing.)';
      }
      let result: SendResult;
      if (!email.to) result = { sent: false, reason: 'no_address' };
      else if (!deps.send) result = { sent: false, reason: 'email_not_configured' };
      else result = await deps.send({ to: [email.to], subject: email.subject, text, html: email.html, attachments: list, fromName: SENDER_NAME });
      if (!result.sent) reasons.push(`${email.kind}: ${result.reason}`);
      await deps.db.insert(reportEmails).values({
        jobId: job.id,
        safeCountId: count.id,
        kind: email.kind,
        toAddress: email.to,
        subject: email.subject,
        bodyText: text,
        attachmentNames: list.map((a) => a.filename),
        status: result.sent ? 'sent' : 'not_sent',
        error: result.sent ? null : result.reason,
      });
    }

    const status = reasons.length ? 'failed' : 'sent';
    await deps.db.update(reportJobs).set({ status, lastError: reasons.join('; ') || null }).where(eq(reportJobs.id, job.id));
    return status;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('runReportJob failed', job.id, e);
    await deps.db.update(reportJobs).set({ status: 'failed', lastError: message.slice(0, 500) }).where(eq(reportJobs.id, job.id));
    return 'failed';
  }
}

/**
 * The sweep's list: jobs waiting or failed, not being worked on, not given up on, and
 * from the last 7 days. Older ones are never sent by surprise: the spreadsheet import
 * brought one job that failed in April 2026, and a report about a count months old
 * belongs to a person's decision (Rapports, "Réessayer"), not a timer's.
 */
export async function dueJobs(db: Conn, limit = 10): Promise<number[]> {
  const rows = await db
    .select({ id: reportJobs.id })
    .from(reportJobs)
    .where(
      and(
        inArray(reportJobs.status, ['pending', 'failed']),
        lt(reportJobs.attempts, MAX_ATTEMPTS),
        gt(reportJobs.createdAt, sql`now() - interval '7 days'`),
        or(isNull(reportJobs.processedAt), lt(reportJobs.processedAt, sql`now() - interval '2 minutes'`)),
      ),
    )
    .orderBy(asc(reportJobs.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

export interface ReportRow {
  jobId: number;
  countId: number;
  restaurantId: string;
  countDate: string;
  countTime: string;
  managerName: string;
  varianceCents: number;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  restaurantEmail: boolean;
  sendToAccountant: boolean;
  createdAt: Date;
  hasPdf: boolean;
  /** Each email's latest try, restaurant first. */
  emails: { kind: string; toAddress: string | null; subject: string; bodyText: string; attachmentNames: string[]; status: 'sent' | 'not_sent'; error: string | null; at: Date }[];
}

/** Rapports: the latest report jobs at these restaurants, each with its emails. */
export async function listReports(db: Conn, storeIds: readonly string[], limit = 50): Promise<ReportRow[]> {
  if (!storeIds.length) return [];
  const jobs = await db
    .select({
      jobId: reportJobs.id,
      countId: safeCounts.id,
      restaurantId: safeCounts.restaurantId,
      countDate: safeCounts.countDate,
      countTime: safeCounts.countTime,
      managerName: safeCounts.managerName,
      varianceCents: safeCounts.varianceCents,
      pdfUrl: safeCounts.pdfUrl,
      status: reportJobs.status,
      attempts: reportJobs.attempts,
      lastError: reportJobs.lastError,
      restaurantEmail: reportJobs.restaurantEmail,
      sendToAccountant: reportJobs.sendToAccountant,
      createdAt: reportJobs.createdAt,
    })
    .from(reportJobs)
    .innerJoin(safeCounts, eq(safeCounts.id, reportJobs.safeCountId))
    .where(inArray(safeCounts.restaurantId, [...storeIds]))
    .orderBy(sql`${reportJobs.id} desc`)
    .limit(limit);
  const ids = jobs.map((j) => j.jobId);
  const mails = ids.length ? await db.select().from(reportEmails).where(inArray(reportEmails.jobId, ids)).orderBy(asc(reportEmails.id)) : [];
  return jobs.map((j) => {
    const latest = new Map<string, (typeof mails)[number]>();
    for (const m of mails) if (m.jobId === j.jobId) latest.set(m.kind, m);
    return {
      jobId: j.jobId,
      countId: j.countId,
      restaurantId: j.restaurantId,
      countDate: j.countDate,
      countTime: j.countTime.slice(0, 5),
      managerName: j.managerName,
      varianceCents: j.varianceCents,
      status: j.status,
      attempts: j.attempts,
      lastError: j.lastError,
      restaurantEmail: j.restaurantEmail,
      sendToAccountant: j.sendToAccountant,
      createdAt: j.createdAt,
      hasPdf: !!j.pdfUrl,
      emails: [...latest.values()]
        .sort((a, b) => (a.kind === 'restaurant' ? -1 : b.kind === 'restaurant' ? 1 : 0))
        .map((m) => ({ kind: m.kind, toAddress: m.toAddress, subject: m.subject, bodyText: m.bodyText, attachmentNames: m.attachmentNames, status: m.status, error: m.error, at: m.createdAt })),
    };
  });
}

/** "Réessayer" on Rapports: an admin's decision, so the 7-day and attempts limits do not apply. */
export async function releaseForRetry(db: Conn, jobId: number): Promise<boolean> {
  const rows = await db
    .update(reportJobs)
    .set({ processedAt: null })
    .where(and(eq(reportJobs.id, jobId), inArray(reportJobs.status, ['pending', 'failed'])))
    .returning({ id: reportJobs.id });
  return rows.length > 0;
}
