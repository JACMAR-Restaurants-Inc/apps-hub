import { abandonedUploads, unstage } from '@/lib/cash/attachments';
import { cashDb } from '@/lib/cash/db';
import { reportDeps } from '@/lib/cash/report-deps';
import { dueJobs, runReportJob } from '@/lib/cash/reports';
import { timingSafeEqual } from 'node:crypto';

/**
 * Cash Balancing's scheduled sweep (Reports.gs processReportQueue, which ran every
 * minute and could be called by ANYONE, safe-count §8): retries reports that are
 * waiting or failed, then clears uploads nobody submitted within a day.
 *
 * Only Vercel's scheduler can call it: Vercel sends `Authorization: Bearer
 * <CRON_SECRET>`, and without CRON_SECRET set this refuses everyone.
 */
export const maxDuration = 60;

function allowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!allowed(req)) return new Response('Unauthorized', { status: 401 });
  const started = Date.now();
  const deps = reportDeps();
  const reports: Record<string, number> = { sent: 0, failed: 0, skipped: 0 };
  for (const id of await dueJobs(deps.db)) {
    if (Date.now() - started > 40_000) break; // leave the rest to the next run
    reports[await runReportJob(deps, id)]! += 1;
  }

  let uploadsCleared = 0;
  for (const u of await abandonedUploads(cashDb(), new Date(Date.now() - 86_400_000))) {
    const out = await unstage(cashDb(), u.id, u.uploadedBy ?? '');
    if (out.ok) {
      uploadsCleared += 1;
      if (out.ref) await deps.files.remove(out.ref).catch((e) => console.error('sweep: file left behind', u.id, e));
    }
  }
  return Response.json({ reports, uploadsCleared });
}
