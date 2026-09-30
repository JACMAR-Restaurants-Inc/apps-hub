import { memberKey, permissionKey, type RosterSnapshot } from '@hub/rbac';
import { describe, expect, it, vi } from 'vitest';
import { AccessDenied, authorizeBetaWith, authorizeWith, requireAdminWith, type AuthorizeDeps, type Denial } from './authorize-core';

// No real beta exists yet (lib/beta/apps.ts), so these tests bring their own.
vi.mock('./beta/apps', async (importOriginal) => {
  const real = await importOriginal<typeof import('./beta/apps')>();
  const TEST = [
    { key: 'TestBeta', base: 'SafeCount', name: 'Test beta', nameFr: 'Bêta de test', blurb: 'A test.', blurbFr: 'Un test.', path: '/beta/test', mark: 'TB', tint: '#0369A1' },
  ];
  return { ...real, BETA_APPS: TEST, betaApp: (key: string) => TEST.find((a) => a.key === key) };
});

const roster: RosterSnapshot = {
  admins: new Set(['admin@jacmar-restaurants.com']),
  users: new Map([['manager@gmail.com', { active: true }]]),
  restaurants: new Map([['1647', { active: true }]]),
  members: new Map([[memberKey('cash', 'manager@gmail.com'), { role: 'manager', status: 'active', stores: new Set(['1647']) }]]),
  permissions: new Map([[permissionKey('cash', 'count', 'create'), { scope: 'store', roles: new Set(['manager']) }]]),
};

function deps(over: Partial<AuthorizeDeps> = {}) {
  const denials: Denial[] = [];
  const logged: string[] = [];
  const d: AuthorizeDeps = {
    signedInEmail: async () => 'manager@gmail.com',
    roster: async () => roster,
    recordDenial: async (x) => void denials.push(x),
    log: (m) => void logged.push(m),
    ...over,
  };
  return { d, denials, logged };
}

const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'allowed';
  } catch (e) {
    expect(e).toBeInstanceOf(AccessDenied);
    return (e as AccessDenied).reason;
  }
};

describe('authorize', () => {
  it('returns who is acting when can() allows, and records nothing', async () => {
    const { d, denials } = deps();
    await expect(authorizeWith(d, 'cash', 'count', 'create', '1647')).resolves.toEqual({ email: 'manager@gmail.com' });
    expect(denials).toEqual([]);
  });

  it('denies and audits a signed-in person can() refuses, with the reason', async () => {
    const { d, denials } = deps();
    expect(await reasonOf(authorizeWith(d, 'cash', 'count', 'create', '3472'))).toBe('store_inactive');
    expect(denials).toEqual([
      {
        actorEmail: 'manager@gmail.com',
        app: 'cash',
        restaurantId: '3472',
        detail: { resource: 'count', action: 'create', reason: 'store_inactive' },
      },
    ]);
  });

  it('denies a caller with no session, without writing to the audit', async () => {
    const { d, denials } = deps({ signedInEmail: async () => null });
    expect(await reasonOf(authorizeWith(d, 'cash', 'count', 'create', '1647'))).toBe('not_signed_in');
    expect(denials).toEqual([]);
  });

  it('fails closed when the roster cannot be read', async () => {
    const { d, denials, logged } = deps({ roster: async () => Promise.reject(new Error('db down')) });
    expect(await reasonOf(authorizeWith(d, 'cash', 'count', 'create', '1647'))).toBe('error');
    expect(denials[0]?.detail.reason).toBe('error');
    expect(logged).toHaveLength(1);
  });

  it('fails closed when the session cannot be read', async () => {
    const { d } = deps({ signedInEmail: async () => Promise.reject(new Error('bad cookie')) });
    expect(await reasonOf(authorizeWith(d, 'cash', 'count', 'create', '1647'))).toBe('error');
  });

  it('still denies when the denial cannot be recorded', async () => {
    const { d, logged } = deps({ recordDenial: async () => Promise.reject(new Error('audit down')) });
    expect(await reasonOf(authorizeWith(d, 'cash', 'count', 'create', '3472'))).toBe('store_inactive');
    expect(logged).toEqual(['authorize: could not audit a denial']);
  });
});

describe('authorizeBeta', () => {
  // The test beta, TestBeta, is a new version of Cash Balancing (SafeCount).
  const live: RosterSnapshot = {
    ...roster,
    members: new Map([[memberKey('SafeCount', 'manager@gmail.com'), { role: 'manager', status: 'active', stores: new Set(['1647']) }]]),
    permissions: new Map([[permissionKey('SafeCount', 'count', 'create'), { scope: 'store', roles: new Set(['manager']) }]]),
  };
  const beta = (tester: boolean | (() => Promise<boolean>), over: Partial<AuthorizeDeps> = {}) => {
    const x = deps({ roster: async () => live, ...over });
    const isTester = typeof tester === 'function' ? tester : async () => tester;
    return { ...x, d: { ...x.d, isTester } };
  };

  it('lets a tester through with their live role and restaurant, and records nothing', async () => {
    const { d, denials } = beta(true);
    await expect(authorizeBetaWith(d, 'TestBeta', 'count', 'create', '1647')).resolves.toEqual({ email: 'manager@gmail.com' });
    expect(denials).toEqual([]);
  });

  it('refuses a non-tester, audited under the BETA, not the live app', async () => {
    const { d, denials } = beta(false);
    expect(await reasonOf(authorizeBetaWith(d, 'TestBeta', 'count', 'create', '1647'))).toBe('not_tester');
    expect(denials).toEqual([
      { actorEmail: 'manager@gmail.com', app: 'TestBeta', restaurantId: '1647', detail: { resource: 'count', action: 'create', reason: 'not_tester' } },
    ]);
  });

  it('fails closed when the tester list cannot be read', async () => {
    const { d, logged } = beta(() => Promise.reject(new Error('db down')));
    expect(await reasonOf(authorizeBetaWith(d, 'TestBeta', 'count', 'create', '1647'))).toBe('error');
    expect(logged).toHaveLength(1);
  });

  it('denies a caller with no session, without writing to the audit', async () => {
    const { d, denials } = beta(true, { signedInEmail: async () => null });
    expect(await reasonOf(authorizeBetaWith(d, 'TestBeta', 'count', 'create', '1647'))).toBe('not_signed_in');
    expect(denials).toEqual([]);
  });
});

describe('requireAdmin', () => {
  const admins = { ...roster, admins: new Set(['admin@jacmar-restaurants.com']) };

  it('lets a system admin through, and nobody else, auditing a signed-in refusal', async () => {
    const ok = deps({ signedInEmail: async () => 'admin@jacmar-restaurants.com', roster: async () => admins });
    await expect(requireAdminWith(ok.d, 'grant')).resolves.toEqual({ email: 'admin@jacmar-restaurants.com' });

    const manager = deps({ roster: async () => admins });
    expect(await reasonOf(requireAdminWith(manager.d, 'grant'))).toBe('not_admin');
    expect(manager.denials).toEqual([
      { actorEmail: 'manager@gmail.com', app: 'portal', restaurantId: null, detail: { resource: 'admin', action: 'grant', reason: 'not_admin' } },
    ]);
  });

  it('break-glass counts only while the admins table is empty', async () => {
    const empty = deps({ signedInEmail: async () => 'sony@jacmar-restaurants.com', roster: async () => ({ ...roster, admins: new Set() }) });
    await expect(requireAdminWith(empty.d, 'grant')).resolves.toBeDefined();
    const filled = deps({ signedInEmail: async () => 'sony@jacmar-restaurants.com', roster: async () => admins });
    expect(await reasonOf(requireAdminWith(filled.d, 'grant'))).toBe('not_admin');
  });

  it('fails closed, and does not audit a caller with no session', async () => {
    const broken = deps({ roster: async () => Promise.reject(new Error('down')) });
    expect(await reasonOf(requireAdminWith(broken.d, 'grant'))).toBe('error');
    const anon = deps({ signedInEmail: async () => null });
    expect(await reasonOf(requireAdminWith(anon.d, 'grant'))).toBe('not_signed_in');
    expect(anon.denials).toEqual([]);
  });
});
