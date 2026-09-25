import { describe, expect, it } from 'vitest';
import {
  BREAK_GLASS_ADMIN,
  can,
  explain,
  memberKey,
  permissionKey,
  type MemberStatus,
  type Role,
  type RosterSnapshot,
  type Scope,
} from './can';

const APP = 'cash';

// A small roster shaped like the real one: Perm_SafeCount's rows (RBAC CLAUDE.md §5).
function roster(overrides: Partial<RosterSnapshot> = {}): RosterSnapshot {
  const perm = (scope: Scope, ...roles: Role[]) => ({ scope, roles: new Set(roles) });
  const member = (role: Role | null, status: MemberStatus, ...stores: string[]) => ({
    role,
    status,
    stores: new Set(stores),
  });
  return {
    admins: new Set(['admin@jacmar-restaurants.com']),
    users: new Map([
      ['manager@gmail.com', { active: true }],
      ['office@jacmar-restaurants.com', { active: true }],
      ['gone@gmail.com', { active: false }],
      ['pending@gmail.com', { active: true }],
      ['revoked@gmail.com', { active: true }],
    ]),
    restaurants: new Map([
      ['1647', { active: true }],
      ['3472', { active: true }],
      ['99999', { active: false }],
    ]),
    members: new Map([
      [memberKey(APP, 'manager@gmail.com'), member('manager', 'active', '1647', '99999')],
      [memberKey(APP, 'office@jacmar-restaurants.com'), member('office', 'active', '1647', '3472')],
      [memberKey(APP, 'gone@gmail.com'), member('manager', 'active', '1647')],
      [memberKey(APP, 'pending@gmail.com'), member(null, 'pending')],
      [memberKey(APP, 'revoked@gmail.com'), member('manager', 'revoked', '1647')],
    ]),
    permissions: new Map([
      [permissionKey(APP, 'count', 'create'), perm('store', 'manager')],
      [permissionKey(APP, 'count', 'view'), perm('store', 'office', 'manager', 'viewer')],
      [permissionKey(APP, 'dashboard_consolidated', 'view'), perm('consolidated', 'office', 'viewer')],
      [permissionKey(APP, 'admin_panel', 'access'), perm('global', 'office')],
    ]),
    ...overrides,
  };
}

describe('can(): the RBAC contract, in order', () => {
  it('1. a system admin is allowed without any app row', () => {
    expect(explain(roster(), 'admin@jacmar-restaurants.com', APP, 'count', 'create', '1647').reason).toBe('system_admin');
  });

  it('2. someone not on the roster, or inactive, is refused', () => {
    expect(explain(roster(), 'stranger@gmail.com', APP, 'count', 'view', '1647').reason).toBe('not_on_roster');
    expect(explain(roster(), 'gone@gmail.com', APP, 'count', 'view', '1647').reason).toBe('user_inactive');
  });

  it('3. only an ACTIVE app membership counts', () => {
    expect(explain(roster(), 'pending@gmail.com', APP, 'count', 'view', '1647').reason).toBe('app_status_pending');
    expect(explain(roster(), 'revoked@gmail.com', APP, 'count', 'view', '1647').reason).toBe('app_status_revoked');
    expect(explain(roster(), 'manager@gmail.com', 'other-app', 'count', 'view', '1647').reason).toBe('no_app_access');
  });

  it('4. an unknown permission is refused, not defaulted', () => {
    expect(explain(roster(), 'manager@gmail.com', APP, 'count', 'delete', '1647').reason).toBe('no_such_permission');
  });

  it('5. store scope: a store must be named, active, and held', () => {
    const r = roster();
    expect(explain(r, 'manager@gmail.com', APP, 'count', 'create').reason).toBe('store_required');
    expect(explain(r, 'manager@gmail.com', APP, 'count', 'create', '3472').reason).toBe('store_not_held');
    // Held, but the restaurant was closed: closing a store must take effect.
    expect(explain(r, 'manager@gmail.com', APP, 'count', 'create', '99999').reason).toBe('store_inactive');
    expect(can(r, 'manager@gmail.com', APP, 'count', 'create', '1647')).toBe(true);
  });

  it('6. the role must be granted the permission', () => {
    // Office staff view counts but do not count safes.
    expect(can(roster(), 'office@jacmar-restaurants.com', APP, 'count', 'view', '3472')).toBe(true);
    expect(explain(roster(), 'office@jacmar-restaurants.com', APP, 'count', 'create', '1647').reason).toBe('role_not_granted');
    expect(can(roster(), 'manager@gmail.com', APP, 'admin_panel', 'access')).toBe(false);
    expect(can(roster(), 'office@jacmar-restaurants.com', APP, 'admin_panel', 'access')).toBe(true);
  });

  it('non-store scopes need no store', () => {
    expect(can(roster(), 'office@jacmar-restaurants.com', APP, 'dashboard_consolidated', 'view')).toBe(true);
    expect(can(roster(), 'manager@gmail.com', APP, 'dashboard_consolidated', 'view')).toBe(false);
  });

  it('matches the email the way sign-in returns it', () => {
    // Google may return the dotted or undotted Gmail address, in any case.
    expect(can(roster(), 'Mana.Ger@Gmail.com', APP, 'count', 'create', '1647')).toBe(true);
  });

  it('store ids compare as trimmed strings', () => {
    expect(can(roster(), 'manager@gmail.com', APP, 'count', 'create', ' 1647 ')).toBe(true);
  });
});

describe('break-glass admin', () => {
  it('is an admin only while the admins table is empty', () => {
    expect(can(roster({ admins: new Set() }), BREAK_GLASS_ADMIN, APP, 'admin_panel', 'access')).toBe(true);
    expect(explain(roster(), BREAK_GLASS_ADMIN, APP, 'admin_panel', 'access').reason).toBe('not_on_roster');
  });
});

describe('fails closed', () => {
  it('an exception while deciding denies', () => {
    const broken = roster({
      users: {
        get() {
          throw new Error('database unreachable');
        },
      } as unknown as RosterSnapshot['users'],
    });
    expect(explain(broken, 'manager@gmail.com', APP, 'count', 'view', '1647')).toEqual({ allowed: false, reason: 'error' });
  });

  it('an empty roster restricts everybody but the break-glass admin', () => {
    const empty: RosterSnapshot = {
      admins: new Set(),
      users: new Map(),
      restaurants: new Map(),
      members: new Map(),
      permissions: new Map(),
    };
    expect(can(empty, 'manager@gmail.com', APP, 'count', 'view', '1647')).toBe(false);
  });
});
