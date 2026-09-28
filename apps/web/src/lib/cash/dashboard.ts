/**
 * The dashboard's figures (Api.gs apiDashboard + App.html renderDashboard), from the
 * week's counts at the restaurants this person holds. Pure.
 *
 * "Latest" means today's latest, as in the old app: a restaurant with no count today
 * has no variance today, and shows in "sans décompte aujourd'hui" instead.
 */

import type { CountSummary } from './store';

export interface StoreSummary {
  id: string;
  name: string;
  expectedCents: number | null;
  countsToday: number;
  last: { time: string; manager: string; varianceCents: number; grandTotalCents: number } | null;
}

export interface Dashboard {
  countsToday: number;
  countsWeek: number;
  /** Restaurants whose latest count today is off. */
  short: number;
  /** The sum of each restaurant's latest variance today. */
  netCents: number;
  counted: number;
  stores: StoreSummary[];
}

/** 'YYYY-MM-DD' seven days before a Toronto date (the old app's week). */
export function weekBefore(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - 7)).toISOString().slice(0, 10);
}

export function dashboard(
  today: string,
  stores: readonly { id: string; name: string }[],
  week: readonly CountSummary[],
  expected: ReadonlyMap<string, number>,
): Dashboard {
  const todays = week.filter((c) => c.countDate === today);
  const summaries = stores.map((s): StoreSummary => {
    const mine = todays.filter((c) => c.restaurantId === s.id);
    const last = mine.at(-1); // counts arrive in filing order
    return {
      id: s.id,
      name: s.name,
      expectedCents: expected.get(s.id) ?? null,
      countsToday: mine.length,
      last: last ? { time: last.countTime, manager: last.managerName, varianceCents: last.varianceCents, grandTotalCents: last.grandTotalCents } : null,
    };
  });
  const withCount = summaries.filter((s) => s.last);
  return {
    countsToday: todays.length,
    countsWeek: week.length,
    short: withCount.filter((s) => s.last!.varianceCents !== 0).length,
    netCents: withCount.reduce((n, s) => n + s.last!.varianceCents, 0),
    counted: withCount.length,
    stores: summaries,
  };
}
