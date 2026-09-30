import { describe, expect, it } from 'vitest';
import { cashAbilities } from './viewer';

describe('who files counts and sends to the accountant', () => {
  const who = (over: Partial<Parameters<typeof cashAbilities>[0]>) => cashAbilities({ systemAdmin: false, office: false, adminPanel: false, role: null, stores: 1, ...over });

  it('a manager does both', () => {
    expect(who({ role: 'manager' })).toEqual({ canCount: true, canSendToAccountant: true });
  });

  it('a system admin does whatever a manager can (owner, 2026-09-29)', () => {
    // A system admin passes can() for the consolidated view and the admin panel too.
    expect(who({ systemAdmin: true, office: true, adminPanel: true, stores: 7 })).toEqual({ canCount: true, canSendToAccountant: true });
  });

  it('office staff never count and never send (safe-count §4)', () => {
    expect(who({ role: 'office', office: true, adminPanel: true })).toEqual({ canCount: false, canSendToAccountant: false });
  });

  it('a viewer sees counts, and neither files nor sends them', () => {
    expect(who({ role: 'viewer', office: true })).toEqual({ canCount: false, canSendToAccountant: false });
  });

  it('nobody counts without a restaurant', () => {
    expect(who({ role: 'manager', stores: 0 }).canCount).toBe(false);
    expect(who({ systemAdmin: true, stores: 0 }).canCount).toBe(false);
  });
});
