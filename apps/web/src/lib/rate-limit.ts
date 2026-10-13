/**
 * Rate limits (2026-09-30, after the owner's "is it protected from web attacks?"). Kept
 * in Postgres (portal.rate_limits), not in memory: Vercel runs several instances, and a
 * count in memory would be per instance, so a flood spread over them would never trip.
 *
 * Fixed windows: one row per key and window, counted up by ONE atomic upsert, so two
 * requests at the same moment cannot both read "4" and both pass a limit of 5.
 *
 * A limit FAILS OPEN: if the count cannot be read, the action goes ahead and the error is
 * logged. A limit is a brake on abuse, not an access rule (authorize() fails closed), and
 * with the database down the action fails on its own anyway.
 *
 * Where they apply, and why (every limit is per person, by signed-in address):
 * - accessRequest: asking for access reaches Clearview and emails the admins.
 * - formSubmit: each submission will email HR (Forms, 2026-10-09).
 * - formUpload: each file is stored (Forms, 2026-10-13).
 * - denialAudit: a refused action writes a journal row; anyone with a Google account can
 *   sign in, so without this a stranger could grow rbac.audit without end.
 * - noGrantsAudit: the same for "signed in with no access", written at each sign-in.
 * Uploads, counts and report emails were already bounded (a daily cap per restaurant, one
 * count per restaurant per minute, never resending a sent report).
 */

import { audit, rateLimits, type Db } from '@hub/db';
import { and, eq, lt, sql } from 'drizzle-orm';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export const LIMITS = {
  accessRequest: { max: 5, windowSeconds: 15 * 60 },
  formSubmit: { max: 20, windowSeconds: 60 * 60 },
  formUpload: { max: 60, windowSeconds: 60 * 60 },
  denialAudit: { max: 30, windowSeconds: 60 * 60 },
  noGrantsAudit: { max: 5, windowSeconds: 60 * 60 },
} as const;
export type LimitName = keyof typeof LIMITS;

const KEEP_MS = 24 * 60 * 60 * 1000;

/** Counts one use of `key` in the window containing `now`, and returns the count so far. */
export async function hit(db: Conn, key: string, windowSeconds: number, now = new Date()): Promise<number> {
  const size = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / size) * size);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, hits: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { hits: sql`${rateLimits.hits} + 1` } })
    .returning({ hits: rateLimits.hits });
  // This key's old windows: the table never grows past a day of use.
  await db.delete(rateLimits).where(and(eq(rateLimits.key, key), lt(rateLimits.windowStart, new Date(now.getTime() - KEEP_MS))));
  return row!.hits;
}

export interface Gate {
  allowed: boolean;
  /** Exactly the first use over the limit: the moment to say so once, in the journal. */
  justTripped: boolean;
}

/**
 * Writes a journal row unless this person has written too many of this kind lately.
 * Past the limit, the rows are skipped, and ONE 'rate_limited' row says the limit was
 * reached, so an admin reading the journal still sees that something was going on.
 */
export async function journalUnderLimit(db: Conn, name: 'denialAudit' | 'noGrantsAudit', row: typeof audit.$inferInsert & { actorEmail: string }, now = new Date()): Promise<'written' | 'tripped' | 'skipped'> {
  const gate = await allow(db, name, row.actorEmail, now);
  if (gate.allowed) {
    await db.insert(audit).values(row);
    return 'written';
  }
  if (!gate.justTripped) return 'skipped';
  await db.insert(audit).values({ actorEmail: row.actorEmail, app: row.app, targetEmail: row.targetEmail, event: 'rate_limited', detail: { limit: name } });
  return 'tripped';
}

/** Whether this person may do `name` once more now. Fails open (see above). */
export async function allow(db: Conn, name: LimitName, who: string, now = new Date(), log: (m: string, e: unknown) => void = console.error): Promise<Gate> {
  const { max, windowSeconds } = LIMITS[name];
  try {
    const hits = await hit(db, `${name}:${who}`, windowSeconds, now);
    return { allowed: hits <= max, justTripped: hits === max + 1 };
  } catch (error) {
    log(`rate limit ${name}: could not count, letting it through`, error);
    return { allowed: true, justTripped: false };
  }
}
