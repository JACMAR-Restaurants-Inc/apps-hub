import { describe, expect, it } from 'vitest';
import { fixGuidance } from './guidance';

const till = (label: string, countedCents: number | null, fixed = false) => ({ label, baseCents: 20000, countedCents, fixed });

describe('fixGuidance', () => {
  it('nothing to say when the safe balances and no till is off', () => {
    expect(fixGuidance([till('1', 20000), till('2', null)], 0)).toBeNull();
  });

  it('per-till actions, the net effect on intake, and what the tills leave unexplained', () => {
    const g = fixGuidance([till('1', 19500, true), till('2', 20300), till('3', null)], -700)!;
    expect(g.items).toEqual([
      { label: '1', varianceCents: -500, fixed: true },
      { label: '2', varianceCents: 300, fixed: false },
    ]);
    expect(g.netIntakeCents).toBe(-200);
    expect(g.residualCents).toBe(-500);
    expect(g.unfixed).toBe(1);
  });

  it('leaves out a till nobody has reached yet, but not one marked fixed', () => {
    expect(fixGuidance([till('1', null), till('2', 0)], -1000)!.items).toEqual([]);
    expect(fixGuidance([till('1', 0, true)], -20000)!.items).toEqual([{ label: '1', varianceCents: -20000, fixed: true }]);
  });

  it('a residual of zero when the tills explain the whole variance', () => {
    expect(fixGuidance([till('1', 19000)], -1000)!.residualCents).toBe(0);
  });
});
