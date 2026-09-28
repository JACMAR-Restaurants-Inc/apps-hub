import 'server-only';
import { createGmail, readGmailEnv } from '@hub/email';
import { listRestaurants } from '../restaurants';
import { cashDb } from './db';
import { fileStore } from './files';
import type { ReportDeps } from './reports';

/**
 * The report queue's real dependencies. Email that is not configured is not an error
 * here: every email is then recorded on Rapports as not sent, with the reason.
 * Addresses come from SETTINGS, never from edited data (CLAUDE.md §4): ACCOUNTANT_EMAIL,
 * and on staging REPORT_EMAIL_OVERRIDE for every restaurant's report.
 */
export function reportDeps(): ReportDeps {
  let send: ReportDeps['send'] = null;
  try {
    const gmail = createGmail(readGmailEnv());
    send = (m) => gmail.send(m);
  } catch (e) {
    console.warn('Cash Balancing reports: email not configured,', e instanceof Error ? e.message : e);
  }
  return {
    db: cashDb(),
    files: fileStore(),
    send,
    accountantEmail: process.env.ACCOUNTANT_EMAIL?.trim() || null,
    reportOverride: process.env.REPORT_EMAIL_OVERRIDE?.trim() || null,
    restaurantName: async (id) => (await listRestaurants()).find((r) => r.id === id)?.name ?? id,
  };
}
