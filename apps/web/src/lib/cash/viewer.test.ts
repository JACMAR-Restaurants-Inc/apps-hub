import { describe, expect, it } from 'vitest';
import { cashAbilities } from './viewer';

describe('who files counts and sends to the accountant', () => {
  const who = (over: Partial<Parameters<typeof cashAbilities>[0]>) => cashAbilities({ systemAdmin: false, role: null, stores: 1, ...over });

  it('a manager does both', () => {
    expect(who({ role: 'manager' })).toEqual({ canCount: true, canSendToAccountant: true });
  });

  it('a system admin does whatever a manager can (owner, 2026-09-29)', () => {
    // A system admin passes can() for the consolidated view and the admin panel too.
    expect(who({ systemAdmin: true, stores: 7 })).toEqual({ canCount: true, canSendToAccountant: true });
  });

  it('office staff do whatever a manager does (owner, 2026-09-30; it reversed safe-count §4)', () => {
    expect(who({ role: 'office', stores: 7 })).toEqual({ canCount: true, canSendToAccountant: true });
    expect(who({ role: 'office', stores: 0 }).canCount).toBe(false);
  });

  it('a viewer sees counts, and neither files nor sends them', () => {
    expect(who({ role: 'viewer', stores: 7 })).toEqual({ canCount: false, canSendToAccountant: false });
  });

  it('nobody counts without a restaurant', () => {
    expect(who({ role: 'manager', stores: 0 }).canCount).toBe(false);
    expect(who({ systemAdmin: true, stores: 0 }).canCount).toBe(false);
  });
});
