import type { Lookup } from '@hub/clearview';
import type { Role } from '@hub/rbac';
import { describe, expect, it } from 'vitest';
import type { Mail } from './messages';
import {
  endAccess,
  grantAccess,
  requestAccess,
  updateAccess,
  type AccessDeps,
  type AccessStore,
  type AuditEntry,
  type MemberRow,
  type UserRow,
} from './service';

const APP = 'SafeCount';
const ME = 'manager@gmail.com';
const ADMIN = 'admin@jacmar-restaurants.com';

/** The roster in memory. A transaction snapshots it and restores it if the callback throws. */
function memoryStore(seed: { users?: Record<string, UserRow>; members?: Record<string, MemberRow>; notify?: string[] } = {}) {
  const state = {
    users: new Map(Object.entries(seed.users ?? {})),
    members: new Map(Object.entries(seed.members ?? {})),
    audit: [] as AuditEntry[],
  };
  const key = (app: string, email: string) => `${app}|${email}`;
  const store: AccessStore = {
    async transaction(fn) {
      const snapshot = structuredClone({ users: [...state.users], members: [...state.members], audit: state.audit });
      try {
        return await fn(store);
      } catch (e) {
        state.users = new Map(snapshot.users);
        state.members = new Map(snapshot.members);
        state.audit = snapshot.audit;
        throw e;
      }
    },
    findMember: async (app, email) => structuredClone(state.members.get(key(app, email)) ?? null),
    findUser: async (email) => structuredClone(state.users.get(email) ?? null),
    insertUser: async (email, row) => {
      const { fullName, hrEmail, employeeNumber, clearviewStore, active } = row;
      state.users.set(email, { fullName, hrEmail, employeeNumber, clearviewStore, active });
    },
    fillUserBlanks: async (email, fields) => {
      const u = state.users.get(email)!;
      for (const [k, v] of Object.entries(fields)) if ((u as unknown as Record<string, unknown>)[k] == null) (u as unknown as Record<string, unknown>)[k] = v;
    },
    setUserActive: async (email) => void (state.users.get(email)!.active = true),
    insertMember: async (app, email, row) => void state.members.set(key(app, email), { ...row, role: null, notifiedOn: null, stores: [] }),
    updateMember: async (app, email, patch) => {
      const m = state.members.get(key(app, email))!;
      if (patch.status !== undefined) m.status = patch.status;
      if (patch.role !== undefined) m.role = patch.role;
      if (patch.notifiedOn !== undefined) m.notifiedOn = patch.notifiedOn;
    },
    setMemberStores: async (app, email, stores) => void (state.members.get(key(app, email))!.stores = [...stores]),
    restaurants: async () => [
      { id: '1647', name: 'Hull', active: true },
      { id: '3472', name: 'Aylmer', active: true },
      { id: '99999', name: 'Fermé', active: false },
    ],
    rolesFor: async () => ['office', 'manager', 'viewer'] as Role[],
    notifyAdmins: async () => seed.notify ?? [ADMIN],
    audit: async (entry) => void state.audit.push(entry),
  };
  return { store, state, member: (email = ME) => state.members.get(key(APP, email)) ?? null };
}

const found = (over: Partial<Extract<Lookup, { status: 'found' }>['employee']> = {}): Lookup => ({
  status: 'found',
  employee: { number: '0014', fullName: 'Jane Doe', hrEmail: 'jane@hr.example', active: true, storeNumber: '1647', storeLabel: '1647 - Hull', ...over },
});

function deps(store: AccessStore, lookup: Lookup = found()) {
  const mails: (Mail & { to: string[] })[] = [];
  const lookups: string[] = [];
  const d: AccessDeps = {
    store,
    clearview: { lookupEmployee: async (n) => (lookups.push(n), lookup) },
    send: async (m) => (mails.push(m), { sent: true, id: 'x', redirected: true }),
    urls: { admin: 'https://hub.test/admin/access', app: (p) => `https://hub.test${p}` },
  };
  return { d, mails, lookups };
}

describe('requestAccess', () => {
  it('adds an inactive person and a pending row, and tells the admins: nothing is granted', async () => {
    const m = memoryStore();
    const { d, mails } = deps(m.store);
    expect(await requestAccess(d, ME, APP, ' 0014 ')).toBe('pending');
    expect(m.state.users.get(ME)).toEqual({
      fullName: 'Jane Doe',
      hrEmail: 'jane@hr.example',
      employeeNumber: '0014',
      clearviewStore: '1647',
      active: false,
    });
    expect(m.member()).toEqual({ status: 'pending', role: null, notifiedOn: null, stores: [] });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toEqual([ADMIN]);
    expect(mails[0]!.subject).toContain(ME);
    expect(mails[0]!.text).toContain('1647 - Hull est déjà coché');
  });

  it('requires the employee number, and refuses one Clearview does not know, writing nothing', async () => {
    for (const [number, lookup, outcome] of [
      ['  ', found(), 'employee_required'],
      ['9999', { status: 'not_found' }, 'employee_not_found'],
      ['0014', { status: 'unavailable', reason: 'http_503' }, 'clearview_unavailable'],
    ] as const) {
      const m = memoryStore();
      const { d, mails } = deps(m.store, lookup);
      expect(await requestAccess(d, ME, APP, number)).toBe(outcome);
      expect(m.state.users.size).toBe(0);
      expect(m.member()).toBeNull();
      expect(mails).toHaveLength(0);
      // Refusals are audited: nobody is told, so this is the only trace.
      expect(m.state.audit.map((a) => a.detail.result)).toEqual([outcome]);
    }
  });

  it('a pending or active person asking again is a duplicate: no lookup, no email', async () => {
    for (const status of ['pending', 'active'] as const) {
      const m = memoryStore({ members: { [`${APP}|${ME}`]: { status, role: null, notifiedOn: null, stores: [] } } });
      const { d, mails, lookups } = deps(m.store);
      expect(await requestAccess(d, ME, APP, '0014')).toBe('duplicate');
      expect(lookups).toHaveLength(0);
      expect(mails).toHaveLength(0);
    }
  });

  it('somebody revoked may ask again: same row back to pending, grant stamp cleared, office told', async () => {
    const m = memoryStore({
      users: { [ME]: { fullName: 'Fixed By Admin', hrEmail: null, employeeNumber: null, clearviewStore: null, active: true } },
      members: { [`${APP}|${ME}`]: { status: 'revoked', role: 'manager', notifiedOn: new Date(0), stores: ['3472'] } },
    });
    const { d, mails } = deps(m.store);
    expect(await requestAccess(d, ME, APP, '0014')).toBe('pending');
    expect(m.member()).toEqual({ status: 'pending', role: 'manager', notifiedOn: null, stores: ['3472'] });
    // Blanks filled; a value an admin set is left alone.
    expect(m.state.users.get(ME)).toMatchObject({ fullName: 'Fixed By Admin', hrEmail: 'jane@hr.example', employeeNumber: '0014' });
    expect(mails[0]!.text).toContain('avait déjà eu accès');
  });

  it('only suggests a store the roster has', async () => {
    const m = memoryStore();
    const { d, mails } = deps(m.store, found({ storeNumber: '55555', storeLabel: '55555 - Ailleurs' }));
    await requestAccess(d, ME, APP, '0014');
    expect(m.state.users.get(ME)!.clearviewStore).toBeNull();
    expect(mails[0]!.text).not.toContain('déjà coché');
  });

  it('says loudly when Clearview says the person is not active', async () => {
    const m = memoryStore();
    const { d, mails } = deps(m.store, found({ active: false }));
    await requestAccess(d, ME, APP, '0014');
    expect(mails[0]!.text).toContain('n’est PAS active');
  });

  it('with no admin flagged to be told, tells the break-glass admin rather than nobody', async () => {
    const m = memoryStore({ notify: [] });
    const { d, mails } = deps(m.store);
    await requestAccess(d, ME, APP, '0014');
    expect(mails[0]!.to).toEqual(['sony@jacmar-restaurants.com']);
    expect(m.state.audit.at(-1)!.detail).toMatchObject({ fellBack: true });
  });

  it('a mail failure does not undo or fail the request, and is audited', async () => {
    const m = memoryStore();
    const { d } = deps(m.store);
    d.send = async () => ({ sent: false, reason: 'send_http_403' });
    expect(await requestAccess(d, ME, APP, '0014')).toBe('pending');
    expect(m.member()!.status).toBe('pending');
    expect(m.state.audit.at(-1)).toMatchObject({ event: 'notify', detail: { sent: false, reason: 'send_http_403' } });
  });

  it('refuses an app that is not in the catalogue', async () => {
    const m = memoryStore();
    expect(await requestAccess(deps(m.store).d, ME, 'App_Nope', '0014')).toBe('unknown_app');
  });
});

describe('grantAccess', () => {
  const pending = () =>
    memoryStore({
      users: { [ME]: { fullName: 'Jane', hrEmail: null, employeeNumber: '0014', clearviewStore: '1647', active: false } },
      members: { [`${APP}|${ME}`]: { status: 'pending', role: null, notifiedOn: null, stores: [] } },
    });

  it('switches the person on, sets role and stores, and emails them once', async () => {
    const m = pending();
    const { d, mails } = deps(m.store);
    expect(await grantAccess(d, ADMIN, APP, ME, 'manager', ['3472', '1647', '1647'])).toBe('done');
    expect(m.state.users.get(ME)!.active).toBe(true);
    expect(m.member()).toMatchObject({ status: 'active', role: 'manager', stores: ['1647', '3472'] });
    expect(m.member()!.notifiedOn).toBeInstanceOf(Date);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toEqual([ME]);
    expect(mails[0]!.text).toContain('https://hub.test/cash');
    expect(mails[0]!.text).toContain('1647 - Hull, 3472 - Aylmer');
  });

  it('refuses a role the app does not have, no restaurant, or a closed restaurant', async () => {
    for (const [role, stores] of [
      ['boss', ['1647']],
      ['manager', []],
      ['manager', ['99999']],
      ['manager', ['12345']],
    ] as const) {
      const m = pending();
      expect(await grantAccess(deps(m.store).d, ADMIN, APP, ME, role as Role, [...stores])).toBe('invalid');
      expect(m.member()!.status).toBe('pending');
    }
  });

  it('answers changed if the request is no longer pending (declined meanwhile, or already granted)', async () => {
    const m = pending();
    const { d } = deps(m.store);
    await endAccess(d, ADMIN, APP, ME, 'pending');
    expect(await grantAccess(d, ADMIN, APP, ME, 'manager', ['1647'])).toBe('changed');
    expect(m.member()!.status).toBe('revoked');
    expect(m.state.users.get(ME)!.active).toBe(false);
  });

  it('does not email again if the grant email already went', async () => {
    const m = memoryStore({
      users: { [ME]: { fullName: 'Jane', hrEmail: null, employeeNumber: null, clearviewStore: null, active: true } },
      members: { [`${APP}|${ME}`]: { status: 'pending', role: null, notifiedOn: new Date(0), stores: [] } },
    });
    const { d, mails } = deps(m.store);
    expect(await grantAccess(d, ADMIN, APP, ME, 'manager', ['1647'])).toBe('done');
    expect(mails).toHaveLength(0);
  });

  it('leaves the stamp empty when the email fails, so a later grant can still tell them', async () => {
    const m = pending();
    const { d } = deps(m.store);
    d.send = async () => ({ sent: false, reason: 'token_x' });
    expect(await grantAccess(d, ADMIN, APP, ME, 'manager', ['1647'])).toBe('done');
    expect(m.member()!.notifiedOn).toBeNull();
  });

  it('audits who granted what, with the before', async () => {
    const m = pending();
    await grantAccess(deps(m.store).d, ADMIN, APP, ME, 'manager', ['1647']);
    expect(m.state.audit[0]).toEqual({
      actorEmail: ADMIN,
      app: APP,
      event: 'grant',
      targetEmail: ME,
      detail: { before: { status: 'pending', role: null, stores: [] }, after: { role: 'manager', stores: ['1647'] } },
    });
  });
});

describe('updateAccess and endAccess', () => {
  const active = () =>
    memoryStore({
      users: { [ME]: { fullName: 'Jane', hrEmail: null, employeeNumber: null, clearviewStore: null, active: true } },
      members: { [`${APP}|${ME}`]: { status: 'active', role: 'manager', notifiedOn: new Date(0), stores: ['1647'] } },
    });

  it('a change emails nobody and leaves the person switched on', async () => {
    const m = active();
    const { d, mails } = deps(m.store);
    expect(await updateAccess(d, ADMIN, APP, ME, 'viewer', ['3472'])).toBe('done');
    expect(m.member()).toMatchObject({ status: 'active', role: 'viewer', stores: ['3472'] });
    expect(mails).toHaveLength(0);
  });

  it('removing access revokes the row, keeps it as the record, and leaves the person switch alone', async () => {
    const m = active();
    const { d, mails } = deps(m.store);
    expect(await endAccess(d, ADMIN, APP, ME, 'active')).toBe('done');
    expect(m.member()).toMatchObject({ status: 'revoked', role: 'manager', stores: ['1647'] });
    expect(m.state.users.get(ME)!.active).toBe(true);
    expect(mails).toHaveLength(0);
    expect(m.state.audit[0]!.event).toBe('revoke');
  });

  it('declining revokes the request and tells the person, once, audited', async () => {
    const m = memoryStore({ members: { [`${APP}|${ME}`]: { status: 'pending', role: null, notifiedOn: null, stores: [] } } });
    const { d, mails } = deps(m.store);
    expect(await endAccess(d, ADMIN, APP, ME, 'pending')).toBe('done');
    expect(m.member()!.status).toBe('revoked');
    expect(m.state.audit.map((a) => a.event)).toEqual(['decline', 'notify']);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toEqual([ME]);
    expect(mails[0]!.subject).toBe('Votre demande d’accès à Cash Balancing');
    expect(mails[0]!.text).toContain('n’a pas été acceptée');
    // A decline that lost the race tells nobody.
    expect(await endAccess(d, ADMIN, APP, ME, 'pending')).toBe('changed');
    expect(mails).toHaveLength(1);
  });

  it('a decline whose email fails is still a decline', async () => {
    const m = memoryStore({ members: { [`${APP}|${ME}`]: { status: 'pending', role: null, notifiedOn: null, stores: [] } } });
    const { d } = deps(m.store);
    d.send = async () => ({ sent: false, reason: 'token_unauthorized_client' });
    expect(await endAccess(d, ADMIN, APP, ME, 'pending')).toBe('done');
    expect(m.member()!.status).toBe('revoked');
    expect(m.state.audit.at(-1)!.detail).toMatchObject({ mail: 'declined', sent: false });
  });

  it('changed when the row is not in the state the admin saw', async () => {
    const m = active();
    const { d } = deps(m.store);
    expect(await endAccess(d, ADMIN, APP, ME, 'pending')).toBe('changed');
    expect(await updateAccess(d, ADMIN, APP, 'nobody@gmail.com', 'viewer', ['1647'])).toBe('changed');
    expect(m.member()!.status).toBe('active');
  });
});
