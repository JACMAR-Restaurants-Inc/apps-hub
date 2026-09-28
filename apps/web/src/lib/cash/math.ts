/**
 * Cash Balancing's arithmetic: what a count adds up to, decided on the SERVER.
 *
 * Ported from safe-count-tracker Api.gs apiSubmitCount, with the gap it left closed:
 * the old server took each coin and bill line's `total` from the browser and summed
 * them, so an edited request could file any total it liked. Here the browser sends
 * only what a person counted (rolls, loose coins, bills, each till's amount, petty
 * cash receipts), and every total is computed from that. The expected total and each
 * till's base come from the configuration, never from the request (safe-count §4).
 *
 * Pure and integer-only (cents): tested without a database (math.test.ts).
 */

import { sumCents, type Cents } from '@hub/core';

/** The RBAC app key, as the Perm_SafeCount tab named it. */
export const CASH_APP = 'SafeCount';

/** Coins: face value and the value of a full roll (Config.gs COIN_DENOMINATIONS). */
export const COINS = [
  { cents: 5, rollCents: 200 },
  { cents: 10, rollCents: 500 },
  { cents: 25, rollCents: 1000 },
  { cents: 100, rollCents: 2500 },
  { cents: 200, rollCents: 5000 },
] as const;

/** Bills (Config.gs BILL_DENOMINATIONS). */
export const BILLS = [500, 1000, 2000, 5000, 10000] as const;

// Far above anything a safe holds, low enough that no sum can leave the integer column.
const MAX_PIECES = 100_000;
const MAX_AMOUNT = 100_000_000; // $1,000,000 in cents
const MAX_PETTY_LINES = 50;
export const MAX_COMMENT = 2000;
export const MAX_DESCRIPTION = 200;

export interface CountInput {
  restaurantId: string;
  comments: string;
  /** What was counted in each till. Only the amount: the till's base and label are configuration. */
  tills: { tillNumber: number; countedCents: number; fixed: boolean }[];
  coins: { cents: number; rolls: number; loose: number }[];
  paper: { cents: number; count: number }[];
  pettyCash: { description: string; amountCents: number }[];
  sendToAccountant: boolean;
  attachmentIds: number[];
}

export interface TillConfig {
  tillNumber: number;
  tillLabel: string;
  baseAmountCents: Cents;
}

export interface ComputedCount {
  tills: {
    tillNumber: number;
    tillLabel: string;
    baseAmountCents: Cents;
    countedAmountCents: Cents;
    varianceCents: Cents;
    wasShort: boolean;
    wasFixed: boolean;
    fixAmountFromIntakeCents: Cents;
  }[];
  /** One row per till fixed with a variance. intakeDelta has the till variance's sign. */
  fixes: { tillNumber: number; shortageAmountCents: Cents; intakeDeltaCents: Cents }[];
  coins: { denominationCents: number; rolls: number; looseCount: number; totalCents: Cents }[];
  paper: { denominationCents: number; count: number; totalCents: Cents }[];
  pettyCash: { description: string | null; amountCents: Cents }[];
  tillsTotalCents: Cents;
  coinsTotalCents: Cents;
  paperTotalCents: Cents;
  pettyCashTotalCents: Cents;
  grandTotalCents: Cents;
  expectedTotalCents: Cents;
  varianceCents: Cents;
}

export type CountError =
  | 'tills_mismatch'
  | 'bad_denomination'
  | 'bad_number'
  | 'too_many_lines'
  | 'too_long';

const whole = (n: unknown, max: number): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max;

/**
 * Every total of a count, from what was counted and the configuration.
 * Refuses rather than guesses: a till that is not configured (or one left out), a coin
 * that does not exist, a negative or fractional number.
 */
export function computeCount(
  input: CountInput,
  config: { tills: readonly TillConfig[]; expectedTotalCents: Cents },
): { ok: true; count: ComputedCount } | { ok: false; error: CountError } {
  // Tills: exactly the configured ones, each once. A till left out would read as $0
  // counted, a short the size of its float.
  const byNumber = new Map(config.tills.map((t) => [t.tillNumber, t]));
  const seen = new Set<number>();
  if (input.tills.length !== config.tills.length) return { ok: false, error: 'tills_mismatch' };
  const tills: ComputedCount['tills'] = [];
  const fixes: ComputedCount['fixes'] = [];
  for (const t of input.tills) {
    const conf = byNumber.get(t.tillNumber);
    if (!conf || seen.has(t.tillNumber)) return { ok: false, error: 'tills_mismatch' };
    seen.add(t.tillNumber);
    if (!whole(t.countedCents, MAX_AMOUNT)) return { ok: false, error: 'bad_number' };
    const variance = t.countedCents - conf.baseAmountCents;
    const wasShort = variance < 0;
    // "Fixed" means something only where there was something to fix.
    const wasFixed = t.fixed === true && variance !== 0;
    tills.push({
      tillNumber: conf.tillNumber,
      tillLabel: conf.tillLabel,
      baseAmountCents: conf.baseAmountCents,
      countedAmountCents: t.countedCents,
      varianceCents: variance,
      wasShort,
      wasFixed,
      fixAmountFromIntakeCents: wasShort && wasFixed ? -variance : 0,
    });
    if (wasFixed) {
      fixes.push({ tillNumber: conf.tillNumber, shortageAmountCents: wasShort ? -variance : 0, intakeDeltaCents: variance });
    }
  }
  tills.sort((a, b) => a.tillNumber - b.tillNumber);
  fixes.sort((a, b) => a.tillNumber - b.tillNumber);

  // Coins and bills: every denomination gets a row, zero where nothing was sent.
  const coinsIn = new Map<number, { rolls: number; loose: number }>();
  for (const c of input.coins) {
    if (!COINS.some((d) => d.cents === c.cents) || coinsIn.has(c.cents)) return { ok: false, error: 'bad_denomination' };
    if (!whole(c.rolls, MAX_PIECES) || !whole(c.loose, MAX_PIECES)) return { ok: false, error: 'bad_number' };
    coinsIn.set(c.cents, c);
  }
  const coins = COINS.map((d) => {
    const c = coinsIn.get(d.cents) ?? { rolls: 0, loose: 0 };
    return { denominationCents: d.cents, rolls: c.rolls, looseCount: c.loose, totalCents: c.rolls * d.rollCents + c.loose * d.cents };
  });

  const paperIn = new Map<number, number>();
  for (const p of input.paper) {
    if (!(BILLS as readonly number[]).includes(p.cents) || paperIn.has(p.cents)) return { ok: false, error: 'bad_denomination' };
    if (!whole(p.count, MAX_PIECES)) return { ok: false, error: 'bad_number' };
    paperIn.set(p.cents, p.count);
  }
  const paper = BILLS.map((cents) => {
    const count = paperIn.get(cents) ?? 0;
    return { denominationCents: cents, count, totalCents: count * cents };
  });

  // Petty cash: receipts. A line with no amount and no words is an empty form row.
  if (input.pettyCash.length > MAX_PETTY_LINES) return { ok: false, error: 'too_many_lines' };
  const pettyCash: ComputedCount['pettyCash'] = [];
  for (const p of input.pettyCash) {
    if (!whole(p.amountCents, MAX_AMOUNT)) return { ok: false, error: 'bad_number' };
    const description = typeof p.description === 'string' ? p.description.trim() : '';
    if (description.length > MAX_DESCRIPTION) return { ok: false, error: 'too_long' };
    if (p.amountCents === 0 && !description) continue;
    pettyCash.push({ description: description || null, amountCents: p.amountCents });
  }
  if (typeof input.comments !== 'string' || input.comments.length > MAX_COMMENT) return { ok: false, error: 'too_long' };

  const tillsTotalCents = sumCents(tills.map((t) => t.countedAmountCents));
  const coinsTotalCents = sumCents(coins.map((c) => c.totalCents));
  const paperTotalCents = sumCents(paper.map((p) => p.totalCents));
  const pettyCashTotalCents = sumCents(pettyCash.map((p) => p.amountCents));
  const grandTotalCents = tillsTotalCents + coinsTotalCents + paperTotalCents + pettyCashTotalCents;

  return {
    ok: true,
    count: {
      tills,
      fixes,
      coins,
      paper,
      pettyCash,
      tillsTotalCents,
      coinsTotalCents,
      paperTotalCents,
      pettyCashTotalCents,
      grandTotalCents,
      expectedTotalCents: config.expectedTotalCents,
      varianceCents: grandTotalCents - config.expectedTotalCents,
    },
  };
}

/**
 * The shape of a count as it arrives from the browser, checked before anything reads
 * it. A server action is a public endpoint that anyone can call with anything
 * (safe-count §3), so this refuses whatever is not exactly a count. The numbers
 * themselves are judged by computeCount.
 */
export function parseCountInput(raw: unknown): CountInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, max: number): Record<string, unknown>[] | null =>
    Array.isArray(v) && v.length <= max && v.every((x) => x && typeof x === 'object') ? (v as Record<string, unknown>[]) : null;
  const tillsIn = list(r.tills, 50);
  const coinsIn = list(r.coins, COINS.length);
  const paperIn = list(r.paper, BILLS.length);
  const pettyIn = list(r.pettyCash, MAX_PETTY_LINES);
  const ids = Array.isArray(r.attachmentIds) && r.attachmentIds.length <= 20 ? r.attachmentIds : null;
  if (typeof r.restaurantId !== 'string' || !r.restaurantId || r.restaurantId.length > 20) return null;
  if (typeof r.comments !== 'string' || typeof r.sendToAccountant !== 'boolean') return null;
  if (!tillsIn || !coinsIn || !paperIn || !pettyIn || !ids) return null;
  if (!tillsIn.every((t) => typeof t.fixed === 'boolean')) return null;
  if (!pettyIn.every((p) => typeof p.description === 'string')) return null;
  return {
    restaurantId: r.restaurantId,
    comments: r.comments,
    tills: tillsIn.map((t) => ({ tillNumber: t.tillNumber as number, countedCents: t.countedCents as number, fixed: t.fixed as boolean })),
    coins: coinsIn.map((c) => ({ cents: c.cents as number, rolls: c.rolls as number, loose: c.loose as number })),
    paper: paperIn.map((p) => ({ cents: p.cents as number, count: p.count as number })),
    pettyCash: pettyIn.map((p) => ({ description: p.description as string, amountCents: p.amountCents as number })),
    sendToAccountant: r.sendToAccountant,
    attachmentIds: ids as number[],
  };
}
