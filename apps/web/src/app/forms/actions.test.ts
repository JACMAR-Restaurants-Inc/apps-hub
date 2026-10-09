/**
 * Every Forms action is a public endpoint (CLAUDE.md §3). HR's actions, called by someone
 * who may not edit forms or with no session, must answer 'denied' or 'expired' and never
 * reach the store. Submitting decides on the roster: with no session it is 'expired',
 * and the store's own refusal is audited as a denial.
 */

import { memberKey, type RosterSnapshot } from '@hub/rbac';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ reason: 'role_not_granted' as string | null, signedIn: 'someone@gmail.com' as string | null }));
const store = vi.hoisted(() => ({
  createForm: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  share: vi.fn(),
  setStatus: vi.fn(),
  submit: vi.fn(),
  updateSettings: vi.fn(),
  duplicateForm: vi.fn(),
  getForm: vi.fn(async () => null),
}));
const journal = vi.hoisted(() => vi.fn(async () => 'written'));

vi.mock('@/lib/access', async () => {
  const { AccessDenied } = await import('@/lib/authorize-core');
  return {
    AccessDenied,
    authorize: vi.fn(async (app: string, resource: string, action: string) => {
      expect([app, resource, action]).toEqual(['Forms', 'form', 'edit']);
      if (access.reason) throw new AccessDenied(access.reason);
      return { email: 'hr@example.invalid' };
    }),
  };
});
vi.mock('@/lib/forms/store', () => store);
vi.mock('@/lib/forms/db', () => ({ formsDb: vi.fn(() => ({})) }));
vi.mock('@/lib/forms/notify', () => ({ tellReached: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: vi.fn(() => ({})) }));
vi.mock('@/lib/people', () => ({ directoryPerson: vi.fn(async (email: string) => ({ email, fullName: 'Someone', employeeNumber: '0042' })) }));
vi.mock('@/lib/rate-limit', () => ({ allow: vi.fn(async () => ({ allowed: true, justTripped: false })), journalUnderLimit: journal }));
const roster: RosterSnapshot = {
  admins: new Set(['admin@example.invalid']),
  users: new Map([['someone@gmail.com', { active: true, role: 'manager', stores: new Set(['1647']) }]]),
  restaurants: new Map([['1647', { active: true }]]),
  members: new Map([[memberKey('SafeCount', 'someone@gmail.com'), { role: 'manager', status: 'active', stores: new Set(['1647']) }]]),
  permissions: new Map(),
};
vi.mock('@/lib/viewer', () => ({
  getSignedInEmail: vi.fn(async () => (access.signedIn ? { email: access.signedIn, name: '' } : null)),
  getRoster: vi.fn(async () => roster),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const actions = await import('./actions');

const hrCalls: [string, () => Promise<{ outcome: string }>][] = [
  ['createFormAction', () => actions.createFormAction('x')],
  ['saveDraftAction', () => actions.saveDraftAction(1, 'x', {})],
  ['publishAction', () => actions.publishAction(1, 'x')],
  ['shareAction', () => actions.shareAction(1, {}, { roles: ['manager'] })],
  ['setStatusAction', () => actions.setStatusAction(1, 'closed', 'x')],
  ['updateSettingsAction', () => actions.updateSettingsAction(1, {}, {})],
  ['duplicateFormAction', () => actions.duplicateFormAction(1, 'x')],
];

describe('HR’s Forms actions refuse anyone who may not edit forms', () => {
  beforeEach(() => {
    Object.values(store).forEach((f) => f.mockClear());
    journal.mockClear();
    access.signedIn = 'someone@gmail.com';
  });

  it('covers every action the file exports', () => {
    const exported = Object.keys(actions).filter((k) => k.endsWith('Action') && k !== 'submitFormAction');
    expect(exported.sort()).toEqual(hrCalls.map(([n]) => n).sort());
  });

  it.each(hrCalls)('%s: signed in without the right is denied and touches nothing', async (_, call) => {
    access.reason = 'role_not_granted';
    expect((await call()).outcome).toBe('denied');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it.each(hrCalls)('%s: no session is expired and touches nothing', async (_, call) => {
    access.reason = 'not_signed_in';
    expect((await call()).outcome).toBe('expired');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it('HR gets through to the store', async () => {
    access.reason = null;
    store.publish.mockResolvedValue({ outcome: 'done', version: 1 });
    expect(await actions.publishAction(1, 'x')).toEqual({ outcome: 'done', version: 1 });
  });
});

describe('submitting', () => {
  beforeEach(() => {
    store.submit.mockReset();
    journal.mockClear();
    access.signedIn = 'someone@gmail.com';
  });

  it('no session is expired and touches nothing', async () => {
    access.signedIn = null;
    expect(await actions.submitFormAction(1, 1, {}, 'x', '1647')).toEqual({ outcome: 'expired' });
    expect(store.submit).not.toHaveBeenCalled();
  });

  it('the person comes from the directory, and the decision from the roster and the form’s row', async () => {
    store.submit.mockImplementation(async (_db, person, _f, _v, _a, _s, decide) => {
      expect(person).toEqual({ email: 'someone@gmail.com', fullName: 'Someone', employeeNumber: '0042' });
      expect(decide('open', { roles: ['manager'], stores: [], people: [] })).toEqual({ restaurantId: '1647' });
      expect(decide('open', { roles: ['office'], stores: [], people: [] })).toBeNull();
      expect(decide('closed', { roles: ['manager'], stores: [], people: [] })).toBeNull();
      return { outcome: 'done', id: 7 };
    });
    expect(await actions.submitFormAction(1, 1, {}, 'x', '')).toEqual({ outcome: 'done', id: 7 });
  });

  it('a restaurant the person does not hold is refused, and the refusal is audited', async () => {
    store.submit.mockImplementation(async (_db, _p, _f, _v, _a, _s, decide) => (decide('open', { roles: ['manager'], stores: [], people: [] }) ? { outcome: 'done', id: 1 } : { outcome: 'denied' }));
    expect(await actions.submitFormAction(1, 1, {}, 'x', '3472')).toEqual({ outcome: 'denied' });
    expect(journal).toHaveBeenCalledWith(expect.anything(), 'denialAudit', expect.objectContaining({ actorEmail: 'someone@gmail.com', app: 'Forms', event: 'denied' }));
  });
});
