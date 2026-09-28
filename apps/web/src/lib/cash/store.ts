/**
 * Cash Balancing's reads and writes. Every function takes the database or a
 * transaction, so the rules are tested on real Postgres inside a transaction that is
 * always rolled back (store.db.test.ts).
 *
 * Only `cash.*` tables here: the portal's data is reached through the narrow door
 * (authorize, the roster, listRestaurants), never joined (CLAUDE.md §3).
 */

import { businessDate, businessTime } from '@hub/core';
import {
  attachments,
  countCoins,
  countPaper,
  countPettyCash,
  countTills,
  reportJobs,
  restaurantSettings,
  safeCounts,
  tillFixes,
  tills,
  type Db,
} from '@hub/db';
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { computeCount, type CountError, type CountInput, type TillConfig } from './math';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Conn = Db | Tx;

/** What a count is measured against: the restaurant's tills and its expected total. */
export async function readSetup(conn: Conn, restaurantId: string): Promise<{ tills: TillConfig[]; expectedTotalCents: number } | null> {
  const [settings] = await conn.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId));
  // No configured total means no meaningful variance: refuse rather than read a missing
  // baseline as zero, a shortage of the whole safe (Api.gs restaurant_not_configured).
  if (!settings) return null;
  const rows = await conn.select().from(tills).where(eq(tills.restaurantId, restaurantId)).orderBy(asc(tills.tillNumber));
  return {
    tills: rows.map((t) => ({ tillNumber: t.tillNumber, tillLabel: t.tillLabel, baseAmountCents: t.baseAmountCents })),
    expectedTotalCents: settings.expectedSafeTotalCents,
  };
}

export type SaveError = CountError | 'not_configured' | 'duplicate' | 'attachment_invalid';
export type SaveOutcome = { ok: true; id: number; jobId: number } | { ok: false; error: SaveError };

class Refused extends Error {
  constructor(readonly code: SaveError) {
    super(code);
  }
}

/**
 * File a count: the count, its lines, its fixes, its report job and its attachments,
 * in ONE transaction. The old app wrote children first and the parent last so a
 * half-written count was invisible (safe-count §8, §17); a transaction means there is
 * no half-written count at all.
 *
 * - Date and time are the server's, in Toronto, at this moment (§8). There is no
 *   backdating: the date is not an input.
 * - One count per restaurant per minute. With the time from the server clock this can
 *   only trip on a double tap (Api.gs: "duplicate protection, not ordering").
 * - A lock per RESTAURANT, never a global one: the old script lock made every
 *   restaurant queue behind every other (§17).
 * - Attachments: only the caller's own staged uploads, at this restaurant. Anything
 *   else refuses the whole count, rather than dropping a photo without a word.
 */
export async function saveCount(
  conn: Conn,
  a: { input: CountInput; email: string; name: string; language: 'fr' | 'en'; now: Date; sendToAccountant: boolean },
): Promise<SaveOutcome> {
  const rid = a.input.restaurantId;
  try {
    const id = await (conn as Db).transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'cash.count:' + rid}))`);

      const setup = await readSetup(tx, rid);
      if (!setup) throw new Refused('not_configured');
      const computed = computeCount(a.input, setup);
      if (!computed.ok) throw new Refused(computed.error);
      const c = computed.count;

      const countDate = businessDate(a.now);
      const countTime = businessTime(a.now);
      const [dupe] = await tx
        .select({ id: safeCounts.id })
        .from(safeCounts)
        .where(and(eq(safeCounts.restaurantId, rid), eq(safeCounts.countDate, countDate), gte(safeCounts.countTime, countTime)))
        .limit(1);
      if (dupe) throw new Refused('duplicate');

      const [row] = await tx
        .insert(safeCounts)
        .values({
          restaurantId: rid,
          managerName: a.name,
          filedBy: a.email,
          countDate,
          countTime,
          comments: a.input.comments.trim() || null,
          tillsTotalCents: c.tillsTotalCents,
          coinsTotalCents: c.coinsTotalCents,
          paperTotalCents: c.paperTotalCents,
          pettyCashTotalCents: c.pettyCashTotalCents,
          grandTotalCents: c.grandTotalCents,
          expectedTotalCents: c.expectedTotalCents,
          varianceCents: c.varianceCents,
          language: a.language,
        })
        .returning({ id: safeCounts.id });
      const countId = row!.id;

      if (c.tills.length) await tx.insert(countTills).values(c.tills.map((t) => ({ ...t, safeCountId: countId, restaurantId: rid })));
      if (c.fixes.length) await tx.insert(tillFixes).values(c.fixes.map((f) => ({ ...f, safeCountId: countId, fixedAt: a.now })));
      await tx.insert(countCoins).values(c.coins.map((x) => ({ ...x, safeCountId: countId })));
      await tx.insert(countPaper).values(c.paper.map((x) => ({ ...x, safeCountId: countId })));
      if (c.pettyCash.length) await tx.insert(countPettyCash).values(c.pettyCash.map((x) => ({ ...x, safeCountId: countId })));

      const wanted = [...new Set(a.input.attachmentIds)];
      if (wanted.some((x) => !Number.isSafeInteger(x))) throw new Refused('attachment_invalid');
      if (wanted.length) {
        const linked = await tx
          .update(attachments)
          .set({ safeCountId: countId })
          .where(
            and(
              inArray(attachments.id, wanted),
              isNull(attachments.safeCountId),
              eq(attachments.uploadedBy, a.email),
              eq(attachments.restaurantId, rid),
            ),
          )
          .returning({ id: attachments.id });
        if (linked.length !== wanted.length) throw new Refused('attachment_invalid');
      }

      // After the count, in the same transaction: the job can never point at nothing.
      const [job] = await tx
        .insert(reportJobs)
        .values({ safeCountId: countId, language: a.language, status: 'pending', sendToAccountant: a.sendToAccountant })
        .returning({ id: reportJobs.id });
      return { countId, jobId: job!.id };
    });
    return { ok: true, id: id.countId, jobId: id.jobId };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.code };
    throw e;
  }
}

/** 'HH:MM:SS' from Postgres to the 'HH:MM' people read. */
const hhmm = (t: string) => t.slice(0, 5);

export interface CountSummary {
  id: number;
  restaurantId: string;
  managerName: string;
  countDate: string;
  countTime: string;
  comments: string | null;
  tillsTotalCents: number;
  coinsTotalCents: number;
  paperTotalCents: number;
  pettyCashTotalCents: number;
  grandTotalCents: number;
  expectedTotalCents: number;
  varianceCents: number;
  language: string;
  pdfUrl: string | null;
}

function summary(r: typeof safeCounts.$inferSelect): CountSummary {
  return {
    id: r.id,
    restaurantId: r.restaurantId,
    managerName: r.managerName,
    countDate: r.countDate,
    countTime: hhmm(r.countTime),
    comments: r.comments,
    tillsTotalCents: r.tillsTotalCents,
    coinsTotalCents: r.coinsTotalCents,
    paperTotalCents: r.paperTotalCents,
    pettyCashTotalCents: r.pettyCashTotalCents,
    grandTotalCents: r.grandTotalCents,
    expectedTotalCents: r.expectedTotalCents,
    varianceCents: r.varianceCents,
    language: r.language,
    pdfUrl: r.pdfUrl,
  };
}

/** The counts of one day at the given restaurants, in the order they were filed. */
export async function countsOn(conn: Conn, date: string, storeIds: readonly string[]): Promise<CountSummary[]> {
  if (!storeIds.length) return [];
  const rows = await conn
    .select()
    .from(safeCounts)
    .where(and(eq(safeCounts.countDate, date), inArray(safeCounts.restaurantId, [...storeIds])))
    .orderBy(asc(safeCounts.countTime), asc(safeCounts.id));
  return rows.map(summary);
}

/** Counts from `since` (inclusive) at the given restaurants: the dashboard's week. */
export async function countsSince(conn: Conn, since: string, storeIds: readonly string[]): Promise<CountSummary[]> {
  if (!storeIds.length) return [];
  const rows = await conn
    .select()
    .from(safeCounts)
    .where(and(gte(safeCounts.countDate, since), inArray(safeCounts.restaurantId, [...storeIds])))
    .orderBy(asc(safeCounts.countDate), asc(safeCounts.countTime), asc(safeCounts.id));
  return rows.map(summary);
}

/**
 * Each restaurant's most recent count, however old (safe-count §9: never a bounded
 * read that could come back empty and look like "never counted").
 */
export async function latestPerStore(conn: Conn, storeIds: readonly string[]): Promise<Map<string, CountSummary>> {
  if (!storeIds.length) return new Map();
  const rows = await conn
    .selectDistinctOn([safeCounts.restaurantId])
    .from(safeCounts)
    .where(inArray(safeCounts.restaurantId, [...storeIds]))
    .orderBy(safeCounts.restaurantId, desc(safeCounts.countDate), desc(safeCounts.countTime), desc(safeCounts.id));
  return new Map(rows.map((r) => [r.restaurantId, summary(r)]));
}

export interface CountTill {
  tillNumber: number;
  tillLabel: string;
  baseAmountCents: number;
  countedAmountCents: number;
  varianceCents: number;
  wasShort: boolean;
  wasFixed: boolean;
  fixAmountFromIntakeCents: number;
}
/** intakeDelta has the till variance's sign. Fixes from before it was recorded read as -shortage (Api.gs). */
export interface CountFix {
  tillNumber: number;
  intakeDeltaCents: number;
}
export interface CountAttachment {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
}
export interface CountDetail extends CountSummary {
  tills: CountTill[];
  fixes: CountFix[];
  coins: { denominationCents: number; rolls: number; looseCount: number; totalCents: number }[];
  paper: { denominationCents: number; count: number; totalCents: number }[];
  pettyCash: { description: string | null; amountCents: number }[];
  attachments: CountAttachment[];
}

async function tillsAndFixes(conn: Conn, ids: number[]) {
  if (!ids.length) return { tillsBy: new Map<number, CountTill[]>(), fixesBy: new Map<number, CountFix[]>() };
  const [tRows, fRows] = await Promise.all([
    conn.select().from(countTills).where(inArray(countTills.safeCountId, ids)).orderBy(asc(countTills.tillNumber)),
    conn.select().from(tillFixes).where(inArray(tillFixes.safeCountId, ids)).orderBy(asc(tillFixes.tillNumber)),
  ]);
  const tillsBy = new Map<number, CountTill[]>();
  for (const t of tRows) {
    const list = tillsBy.get(t.safeCountId) ?? [];
    list.push({
      tillNumber: t.tillNumber,
      tillLabel: t.tillLabel,
      baseAmountCents: t.baseAmountCents,
      countedAmountCents: t.countedAmountCents,
      varianceCents: t.varianceCents,
      wasShort: t.wasShort,
      wasFixed: t.wasFixed,
      fixAmountFromIntakeCents: t.fixAmountFromIntakeCents,
    });
    tillsBy.set(t.safeCountId, list);
  }
  const fixesBy = new Map<number, CountFix[]>();
  for (const f of fRows) {
    const list = fixesBy.get(f.safeCountId) ?? [];
    list.push({ tillNumber: f.tillNumber, intakeDeltaCents: f.intakeDeltaCents ?? -f.shortageAmountCents });
    fixesBy.set(f.safeCountId, list);
  }
  return { tillsBy, fixesBy };
}

/** One count, everything in it. Null if there is no such count. */
export async function countDetail(conn: Conn, id: number): Promise<CountDetail | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await conn.select().from(safeCounts).where(eq(safeCounts.id, id));
  if (!row) return null;
  const [{ tillsBy, fixesBy }, coins, paper, petty, files] = await Promise.all([
    tillsAndFixes(conn, [id]),
    conn.select().from(countCoins).where(eq(countCoins.safeCountId, id)).orderBy(asc(countCoins.denominationCents)),
    conn.select().from(countPaper).where(eq(countPaper.safeCountId, id)).orderBy(asc(countPaper.denominationCents)),
    conn.select().from(countPettyCash).where(eq(countPettyCash.safeCountId, id)).orderBy(asc(countPettyCash.id)),
    conn.select().from(attachments).where(eq(attachments.safeCountId, id)).orderBy(asc(attachments.id)),
  ]);
  return {
    ...summary(row),
    tills: tillsBy.get(id) ?? [],
    fixes: fixesBy.get(id) ?? [],
    coins: coins.map((c) => ({ denominationCents: c.denominationCents, rolls: c.rolls, looseCount: c.looseCount, totalCents: c.totalCents })),
    paper: paper.map((p) => ({ denominationCents: p.denominationCents, count: p.count, totalCents: p.totalCents })),
    pettyCash: petty.map((p) => ({ description: p.description, amountCents: p.amountCents })),
    attachments: files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.fileSize })),
  };
}

export type PreviousCount = CountSummary & { tills: CountTill[]; fixes: CountFix[] };

/**
 * The New Count screen's "previous count": today's counts at this restaurant, or if
 * there are none, the last count from any earlier day, however long ago (Api.gs
 * apiCountPrefill, lastCountBefore_).
 */
export async function previousCounts(conn: Conn, restaurantId: string, today: string): Promise<{ today: PreviousCount[]; priorDay: PreviousCount | null }> {
  let rows = await conn
    .select()
    .from(safeCounts)
    .where(and(eq(safeCounts.restaurantId, restaurantId), eq(safeCounts.countDate, today)))
    .orderBy(asc(safeCounts.countTime), asc(safeCounts.id));
  let priorDay = false;
  if (!rows.length) {
    rows = await conn
      .select()
      .from(safeCounts)
      .where(and(eq(safeCounts.restaurantId, restaurantId), lt(safeCounts.countDate, today)))
      .orderBy(desc(safeCounts.countDate), desc(safeCounts.countTime), desc(safeCounts.id))
      .limit(1);
    priorDay = rows.length > 0;
  }
  const { tillsBy, fixesBy } = await tillsAndFixes(
    conn,
    rows.map((r) => r.id),
  );
  const full = rows.map((r) => ({ ...summary(r), tills: tillsBy.get(r.id) ?? [], fixes: fixesBy.get(r.id) ?? [] }));
  return priorDay ? { today: [], priorDay: full[0]! } : { today: full, priorDay: null };
}

/**
 * "Send to accountant" after the fact (Api.gs apiSendToAccountant): queues a job that
 * emails the accountant only. Refused if one is already queued or sent.
 */
export async function queueAccountantSend(conn: Conn, countId: number, language: string): Promise<{ outcome: 'done'; jobId: number } | { outcome: 'already_sent' }> {
  return (conn as Db).transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'cash.accountant:' + countId}))`);
    const [existing] = await tx
      .select({ id: reportJobs.id })
      .from(reportJobs)
      .where(and(eq(reportJobs.safeCountId, countId), eq(reportJobs.sendToAccountant, true), inArray(reportJobs.status, ['pending', 'sent'])))
      .limit(1);
    if (existing) return { outcome: 'already_sent' as const };
    // The accountant alone: the restaurant already had its report when the count was filed.
    const [job] = await tx
      .insert(reportJobs)
      .values({ safeCountId: countId, language, status: 'pending', sendToAccountant: true, restaurantEmail: false })
      .returning({ id: reportJobs.id });
    return { outcome: 'done' as const, jobId: job!.id };
  });
}

/** The restaurant a count belongs to, to authorise against the RECORD (safe-count §3). */
export async function countRestaurant(conn: Conn, countId: number): Promise<{ restaurantId: string; language: string } | null> {
  if (!Number.isSafeInteger(countId)) return null;
  const [row] = await conn
    .select({ restaurantId: safeCounts.restaurantId, language: safeCounts.language })
    .from(safeCounts)
    .where(eq(safeCounts.id, countId));
  return row ?? null;
}

/** Each restaurant's expected safe total, for the dashboard. */
export async function expectedTotals(conn: Conn, storeIds: readonly string[]): Promise<Map<string, number>> {
  if (!storeIds.length) return new Map();
  const rows = await conn.select().from(restaurantSettings).where(inArray(restaurantSettings.restaurantId, [...storeIds]));
  return new Map(rows.map((r) => [r.restaurantId, r.expectedSafeTotalCents]));
}
