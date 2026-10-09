import { memberKey, permissionKey, type Role, type RosterSnapshot, type Scope } from '@hub/rbac';
import { describe, expect, it } from 'vitest';
import { FORMS_APP, canEditForms, fillDecision, mayRead, parseAudience, pickStore, responsesScope, type Audience } from './rules';

type P = { role: Role | null; stores: string[]; active?: boolean; apps?: Record<string, 'active' | 'pending' | 'revoked'> };

// Forms' permissions as migration 0017 writes them.
const PERMS: [string, string, Scope, Role[]][] = [
  ['app', 'access', 'global', ['office', 'manager', 'viewer']],
  ['form', 'edit', 'global', ['office']],
  ['responses', 'view_all', 'global', ['office']],
  ['responses', 'view', 'store', ['office', 'manager']],
];

function roster(people: Record<string, P>, admins: string[] = ['admin@jacmar-restaurants.com']): RosterSnapshot {
  const users = new Map<string, { active: boolean; role: Role | null; stores: Set<string> }>();
  const members = new Map<string, { role: Role | null; status: 'active' | 'pending' | 'revoked'; stores: Set<string> }>();
  for (const [email, p] of Object.entries(people)) {
    users.set(email, { active: p.active ?? true, role: p.role, stores: new Set(p.stores) });
    for (const [app, status] of Object.entries(p.apps ?? { SafeCount: 'active' })) members.set(memberKey(app, email), { role: p.role, status, stores: new Set(p.stores) });
  }
  return {
    admins: new Set(admins),
    users,
    restaurants: new Map([
      ['1647', { active: true }],
      ['3472', { active: true }],
      ['9999', { active: false }],
    ]),
    members,
    permissions: new Map(PERMS.map(([r, a, scope, roles]) => [permissionKey(FORMS_APP, r, a), { scope, roles: new Set(roles) }])),
  };
}

const R = roster({
  'hull@gmail.com': { role: 'manager', stores: ['1647'] },
  'two@gmail.com': { role: 'manager', stores: ['1647', '3472', '9999'] },
  'viewer@gmail.com': { role: 'viewer', stores: ['3472'] },
  'office@jacmar-restaurants.com': { role: 'office', stores: ['1647', '3472'], apps: { SafeCount: 'active', Forms: 'active' } },
  'formsmgr@gmail.com': { role: 'manager', stores: ['3472'], apps: { Forms: 'active' } },
  'off@gmail.com': { role: 'manager', stores: ['1647'], active: false },
  'noapp@gmail.com': { role: 'manager', stores: ['1647'], apps: { SafeCount: 'revoked' } },
  'asked@gmail.com': { role: null, stores: [], apps: { SafeCount: 'pending' } },
});

const share = (a: Partial<Audience>): Audience => ({ roles: [], stores: [], people: [], ...a });

describe('fillDecision: who may fill a form', () => {
  it('a form that is not open is filled by nobody, an admin included', () => {
    expect(fillDecision(R, 'admin@jacmar-restaurants.com', 'draft', share({ roles: ['manager'] }))).toEqual({ allowed: false, reason: 'not_open' });
    expect(fillDecision(R, 'hull@gmail.com', 'closed', share({ roles: ['manager'] })).allowed).toBe(false);
  });

  it('shared by role: every holder of that role, with their active restaurants', () => {
    const a = share({ roles: ['manager'] });
    expect(fillDecision(R, 'hull@gmail.com', 'open', a)).toEqual({ allowed: true, stores: ['1647'] });
    // A closed restaurant is never one to file under.
    expect(fillDecision(R, 'two@gmail.com', 'open', a)).toEqual({ allowed: true, stores: ['1647', '3472'] });
    expect(fillDecision(R, 'viewer@gmail.com', 'open', a)).toEqual({ allowed: false, reason: 'not_shared' });
  });

  it('narrowed to restaurants: only holders there, and only for those', () => {
    const a = share({ roles: ['manager'], stores: ['3472'] });
    expect(fillDecision(R, 'hull@gmail.com', 'open', a).allowed).toBe(false);
    expect(fillDecision(R, 'two@gmail.com', 'open', a)).toEqual({ allowed: true, stores: ['3472'] });
  });

  it('chosen by name: whatever their role, at any of their restaurants', () => {
    const a = share({ roles: ['office'], stores: ['3472'], people: ['viewer@gmail.com', 'hull@gmail.com'] });
    expect(fillDecision(R, 'viewer@gmail.com', 'open', a)).toEqual({ allowed: true, stores: ['3472'] });
    expect(fillDecision(R, 'hull@gmail.com', 'open', a)).toEqual({ allowed: true, stores: ['1647'] });
  });

  it('follows the directory: switched off, holding no app, or only asking, sees nothing', () => {
    const a = share({ roles: ['manager'], people: ['off@gmail.com', 'noapp@gmail.com', 'asked@gmail.com', 'stranger@gmail.com'] });
    for (const e of ['off@gmail.com', 'noapp@gmail.com', 'asked@gmail.com', 'stranger@gmail.com']) expect(fillDecision(R, e, 'open', a)).toEqual({ allowed: false, reason: 'not_in_directory' });
  });

  it('holding Forms itself is not needed to fill, nor enough', () => {
    expect(fillDecision(R, 'formsmgr@gmail.com', 'open', share({ roles: ['viewer'] })).allowed).toBe(false);
    expect(fillDecision(R, 'hull@gmail.com', 'open', share({ roles: ['manager'] })).allowed).toBe(true);
  });

  it('a system admin may fill any open form, shared with them or not', () => {
    expect(fillDecision(R, 'admin@jacmar-restaurants.com', 'open', share({}))).toEqual({ allowed: true, stores: [] });
  });

  it('matches the address the way sign-in gives it', () => {
    expect(fillDecision(R, 'Viewer@Gmail.com', 'open', share({ people: ['viewer@gmail.com'] })).allowed).toBe(true);
  });

  it('fails closed', () => {
    const broken = { ...R, users: { get: () => { throw new Error('down'); } } } as unknown as RosterSnapshot;
    expect(fillDecision(broken, 'hull@gmail.com', 'open', share({ roles: ['manager'] }))).toEqual({ allowed: false, reason: 'error' });
  });
});

describe('pickStore: the restaurant a submission is filed under', () => {
  it('their only one by default; one of theirs when they hold several; none when they hold none', () => {
    expect(pickStore({ allowed: true, stores: ['1647'] }, '')).toBe('1647');
    expect(pickStore({ allowed: true, stores: ['1647', '3472'] }, '3472')).toBe('3472');
    expect(pickStore({ allowed: true, stores: ['1647', '3472'] }, '')).toBe('invalid');
    expect(pickStore({ allowed: true, stores: ['1647'] }, '3472')).toBe('invalid');
    expect(pickStore({ allowed: true, stores: [] }, null)).toBeNull();
    expect(pickStore({ allowed: true, stores: [] }, '1647')).toBe('invalid');
    expect(pickStore({ allowed: false, reason: 'x' }, '1647')).toBe('invalid');
  });
});

describe('editing and reading responses', () => {
  it('HR (Bureau holding Forms) and admins edit; a Bureau person without Forms does not', () => {
    expect(canEditForms(R, 'office@jacmar-restaurants.com')).toBe(true);
    expect(canEditForms(R, 'admin@jacmar-restaurants.com')).toBe(true);
    expect(canEditForms(R, 'formsmgr@gmail.com')).toBe(false);
    const noForms = roster({ 'office@jacmar-restaurants.com': { role: 'office', stores: ['1647'] } });
    expect(canEditForms(noForms, 'office@jacmar-restaurants.com')).toBe(false);
  });

  it('HR and admins read every response; a manager holding Forms, their restaurants’; others none', () => {
    expect(responsesScope(R, 'office@jacmar-restaurants.com')).toBe('all');
    expect(responsesScope(R, 'admin@jacmar-restaurants.com')).toBe('all');
    expect(responsesScope(R, 'formsmgr@gmail.com')).toEqual(['3472']);
    expect(responsesScope(R, 'hull@gmail.com')).toEqual([]);
    const viewerForms = roster({ 'v@gmail.com': { role: 'viewer', stores: ['1647'], apps: { Forms: 'active' } } });
    expect(responsesScope(viewerForms, 'v@gmail.com')).toEqual([]);
  });

  it('a submission with no restaurant is read only by those who read all', () => {
    expect(mayRead('all', null)).toBe(true);
    expect(mayRead(['1647'], null)).toBe(false);
    expect(mayRead(['1647'], '1647')).toBe(true);
    expect(mayRead(['1647'], '3472')).toBe(false);
  });
});

describe('parseAudience', () => {
  it('keeps known roles, trims restaurants, normalises and sorts addresses', () => {
    expect(parseAudience({ roles: ['manager', 'owner', 'office'], stores: [' 1647 ', '', 1647], people: ['B.ob@Gmail.com', 'nope', 'b.ob@gmail.com'] })).toEqual({
      roles: ['office', 'manager'],
      stores: ['1647'],
      people: ['bob@gmail.com'],
    });
    expect(parseAudience('everyone')).toEqual({ roles: [], stores: [], people: [] });
  });
});
