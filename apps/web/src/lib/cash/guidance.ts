/**
 * The New Count screen's fix guidance (App.html renderSafeFixGuidance): what to do at
 * each till, the net effect on the day's cash intake, and what is left over that the
 * tills do not explain. Pure, integer cents.
 *
 * A till nobody has touched yet (no amount, not fixed) is left out, as in the old app,
 * so the panel does not shout about every till before the manager reaches it.
 */

export interface GuidanceTill {
  label: string;
  baseCents: number;
  /** Null while the till is empty on the form. */
  countedCents: number | null;
  fixed: boolean;
}

export interface Guidance {
  safeVarianceCents: number;
  items: { label: string; varianceCents: number; fixed: boolean }[];
  /** Overs moved to intake minus shorts taken from it. */
  netIntakeCents: number;
  /** The safe's variance the tills do not account for: coins, bills or petty cash. */
  residualCents: number;
  unfixed: number;
}

export function fixGuidance(tills: readonly GuidanceTill[], safeVarianceCents: number): Guidance | null {
  const items: Guidance['items'] = [];
  for (const t of tills) {
    if ((t.countedCents === null || t.countedCents === 0) && !t.fixed) continue;
    const v = (t.countedCents ?? 0) - t.baseCents;
    if (v === 0) continue;
    items.push({ label: t.label, varianceCents: v, fixed: t.fixed });
  }
  if (safeVarianceCents === 0 && items.length === 0) return null;
  const tillVariance = items.reduce((s, i) => s + i.varianceCents, 0);
  return {
    safeVarianceCents,
    items,
    netIntakeCents: tillVariance,
    residualCents: safeVarianceCents - tillVariance,
    unfixed: items.filter((i) => !i.fixed).length,
  };
}
