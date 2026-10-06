import { memberKey, permissionKey, type RosterSnapshot } from '@hub/rbac';
import { describe, expect, it, vi } from 'vitest';
import { CATALOGUE } from '../catalogue';
import { homeCards } from '../home';
import { APPS } from '../requests/apps';
import { canSee } from '../favourites';
import { BETA_APPS, betaApp } from './apps';
import { betaDecision, testingApps } from './rules';

// No real beta exists yet (lib/beta/apps.ts), so these tests bring their own.
vi.mock('./apps', async (importOriginal) => {
  const real = await importOriginal<typeof import('./apps')>();
  const TEST = [
    { key: 'TestBeta', base: 'SafeCount', name: 'Test beta', nameFr: 'Bêta de test', blurb: 'A test.', blurbFr: 'Un test.', path: '/beta/test', mark: 'TB', tint: '#0369A1' },
    // A brand-new app: no live version (owner, 2026-10-06).
    { key: 'NewBeta', base: null, name: 'New beta', nameFr: 'Nouvelle bêta', blurb: 'New.', blurbFr: 'Nouveau.', path: '/beta/new', mark: 'NB', tint: '#0369A1' },
    // An Apps Script test console: a link out, no permissions here (owner, 2026-10-06).
    { key: 'ConsoleBeta', base: null, name: 'Console', nameFr: 'Console', blurb: 'A console.', blurbFr: 'Une console.', path: 'https://script.google.com/macros/s/TEST/exec', mark: 'CO', tint: '#0369A1' },
  ];
  return { ...real, BETA_APPS: TEST, betaApp: (key: string) => TEST.find((a) => a.key === key) };
});

const ADMIN = 'admin@jacmar-restaurants.com';
const HULL = 'hullmanager@gmail.com';
const OFF = 'switchedoff@gmail.com';
const GONE = 'lostcash@gmail.com';

// The placeholder beta's live app is Cash Balancing.
const roster: RosterSnapshot = {
  admins: new Set([ADMIN]),
  users: new Map([
    [HULL, { active: true, role: 'manager', stores: new Set(['1647']) }],
    [OFF, { active: false, role: 'manager', stores: new Set(['1647']) }],
    [GONE, { active: true, role: 'manager', stores: new Set(['1647']) }],
  ]),
  restaurants: new Map([
    ['1647', { active: true }],
    ['2000', { active: true }],
  ]),
  members: new Map([
    [memberKey('SafeCount', HULL), { role: 'manager', status: 'active', stores: new Set(['1647']) }],
    [memberKey('SafeCount', OFF), { role: 'manager', status: 'active', stores: new Set(['1647']) }],
    [memberKey('SafeCount', GONE), { role: 'manager', status: 'revoked', stores: new Set(['1647']) }],
  ]),
  permissions: new Map([
    [permissionKey('SafeCount', 'app', 'access'), { scope: 'global', roles: new Set(['manager', 'office', 'viewer']) }],
    [permissionKey('SafeCount', 'count', 'create'), { scope: 'store', roles: new Set(['manager']) }],
    [permissionKey('NewBeta', 'app', 'access'), { scope: 'global', roles: new Set(['manager', 'office', 'viewer']) }],
    [permissionKey('NewBeta', 'count', 'create'), { scope: 'store', roles: new Set(['manager']) }],
    [permissionKey('NewBeta', 'admin_panel', 'access'), { scope: 'global', roles: new Set(['office']) }],
  ]),
};

const decide = (email: string, tester: boolean, resource = 'app', action = 'access', store?: string, key = 'TestBeta') =>
  betaDecision(roster, email, tester, key, resource, action, store).reason;

describe('who may do what in a beta', () => {
  it('a tester keeps their live role and restaurants: a Gérant at Hull counts at Hull only', () => {
    expect(decide(HULL, true)).toBe('granted');
    expect(decide(HULL, true, 'count', 'create', '1647')).toBe('granted');
    expect(decide(HULL, true, 'count', 'create', '2000')).toBe('store_not_held');
  });

  it('the same person, not on the tester list, is refused, whatever they hold live', () => {
    expect(decide(HULL, false)).toBe('not_tester');
    expect(decide(HULL, false, 'count', 'create', '1647')).toBe('not_tester');
  });

  it('a tester switched off, or who lost the live app, is refused', () => {
    expect(decide(OFF, true)).toBe('user_inactive');
    expect(decide(GONE, true)).toBe('app_status_revoked');
  });

  it('a system admin tests everything, with no tester row', () => {
    expect(decide(ADMIN, false, 'count', 'create', '2000')).toBe('system_admin');
  });

  it('an unknown beta, or a LIVE app named as a beta, denies everyone, admins too', () => {
    expect(decide(ADMIN, true, 'app', 'access', undefined, 'Nope')).toBe('no_such_beta');
    expect(decide(HULL, true, 'app', 'access', undefined, 'SafeCount')).toBe('no_such_beta');
  });
});

describe('a brand-new app (no live version): the person\'s own role and restaurants', () => {
  it('a tester who holds any app tests with their role and restaurants', () => {
    expect(decide(HULL, true, 'app', 'access', undefined, 'NewBeta')).toBe('granted');
    expect(decide(HULL, true, 'count', 'create', '1647', 'NewBeta')).toBe('granted');
    expect(decide(HULL, true, 'count', 'create', '2000', 'NewBeta')).toBe('store_not_held');
    expect(decide(HULL, true, 'admin_panel', 'access', undefined, 'NewBeta')).toBe('role_not_granted');
  });

  it('not a tester, switched off, or holding no app any more: refused', () => {
    expect(decide(HULL, false, 'app', 'access', undefined, 'NewBeta')).toBe('not_tester');
    expect(decide(OFF, true, 'app', 'access', undefined, 'NewBeta')).toBe('user_inactive');
    expect(decide(GONE, true, 'app', 'access', undefined, 'NewBeta')).toBe('app_status_revoked');
  });

  it('a person with no role is refused even while holding an app', () => {
    const r: RosterSnapshot = { ...roster, users: new Map([...roster.users, [HULL, { active: true, role: null, stores: new Set(['1647']) }]]) };
    expect(betaDecision(r, HULL, true, 'NewBeta', 'app', 'access').reason).toBe('role_not_granted');
  });

  it('deciding never changes the roster it was given', () => {
    decide(HULL, true, 'app', 'access', undefined, 'NewBeta');
    expect(roster.members.has(memberKey('NewBeta', HULL))).toBe(false);
  });
});

describe('an Apps Script test console: the portal decides only who sees its card', () => {
  const sees = (email: string, tester: boolean) => betaDecision(roster, email, tester, 'ConsoleBeta', 'app', 'access');

  it('a tester switched on who holds an app sees it, with no permission rows for it', () => {
    expect([...roster.permissions.keys()].some((k) => k.startsWith('ConsoleBeta|'))).toBe(false);
    expect(sees(HULL, true)).toEqual({ allowed: true, reason: 'tester' });
    expect(testingApps(roster, HULL, new Set(['ConsoleBeta'])).map((b) => b.key)).toEqual(['ConsoleBeta']);
  });

  it('not a tester, switched off, holding no app, or a stranger: no card', () => {
    expect(sees(HULL, false).reason).toBe('not_tester');
    expect(sees(OFF, true).reason).toBe('user_inactive');
    expect(sees(GONE, true).reason).toBe('no_app_access');
    expect(sees('stranger@gmail.com', true).reason).toBe('not_on_roster');
  });

  it('an admin sees it without being a tester', () => {
    expect(sees(ADMIN, false)).toEqual({ allowed: true, reason: 'system_admin' });
  });
});

describe('the Tests menu and page', () => {
  it('an admin sees every beta; a tester, the ones they can open; anyone else, none', () => {
    expect(testingApps(roster, ADMIN, new Set()).map((b) => b.key)).toEqual(BETA_APPS.map((b) => b.key));
    expect(testingApps(roster, HULL, new Set(['TestBeta'])).map((b) => b.key)).toEqual(['TestBeta']);
    expect(testingApps(roster, HULL, new Set())).toEqual([]);
    // On the list but cut off live: no tab offering a door that refuses them.
    expect(testingApps(roster, GONE, new Set(['TestBeta']))).toEqual([]);
  });
});

describe('beta apps stay out of every ordinary list', () => {
  it('the REAL list obeys the same rules as the test one', async () => {
    const real = await vi.importActual<typeof import('./apps')>('./apps');
    for (const b of real.BETA_APPS) {
      expect(CATALOGUE.map((a) => a.key)).not.toContain(b.key);
      if (b.base !== null) expect(CATALOGUE.find((a) => a.key === b.base)?.governed).toBe(true);
    }
    expect(new Set(real.BETA_APPS.map((b) => b.key)).size).toBe(real.BETA_APPS.length);
    // Open goes to a page here or to a console over https, never anything else.
    for (const b of real.BETA_APPS) expect(b.path).toMatch(/^(\/[^/]|https:\/\/)/);
  });

  it('each has its own key, and is a new version of a live, roster-governed app, or of none', () => {
    for (const b of BETA_APPS) {
      expect(CATALOGUE.map((a) => a.key)).not.toContain(b.key);
      if (b.base !== null) expect(CATALOGUE.find((a) => a.key === b.base)?.governed).toBe(true);
      expect(betaApp(b.key)).toBe(b);
    }
    expect(new Set(BETA_APPS.map((b) => b.key)).size).toBe(BETA_APPS.length);
  });

  it('never a card on Home or Applications, never askable, never starrable, even for an admin', () => {
    const keys = BETA_APPS.map((b) => b.key);
    const cards = homeCards({ isAdmin: true, personActive: true, memberships: [], formatDay: () => '' });
    expect(cards.filter((c) => keys.includes(c.key))).toEqual([]);
    expect(APPS.filter((a) => keys.includes(a.key))).toEqual([]);
    for (const k of keys) expect(canSee(true, k)).toBe(false);
  });
});
