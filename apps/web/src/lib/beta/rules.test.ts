import { memberKey, permissionKey, type RosterSnapshot } from '@hub/rbac';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../catalogue';
import { homeCards } from '../home';
import { APPS } from '../requests/apps';
import { canSee } from '../favourites';
import { BETA_APPS, betaApp } from './apps';
import { betaDecision, testingApps } from './rules';

const ADMIN = 'admin@jacmar-restaurants.com';
const HULL = 'hullmanager@gmail.com';
const OFF = 'switchedoff@gmail.com';
const GONE = 'lostcash@gmail.com';

// The placeholder beta's live app is Cash Balancing.
const roster: RosterSnapshot = {
  admins: new Set([ADMIN]),
  users: new Map([
    [HULL, { active: true }],
    [OFF, { active: false }],
    [GONE, { active: true }],
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
  ]),
};

const decide = (email: string, tester: boolean, resource = 'app', action = 'access', store?: string, key = 'BetaDemo') =>
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

describe('the Tests menu and page', () => {
  it('an admin sees every beta; a tester, the ones they can open; anyone else, none', () => {
    expect(testingApps(roster, ADMIN, new Set()).map((b) => b.key)).toEqual(BETA_APPS.map((b) => b.key));
    expect(testingApps(roster, HULL, new Set(['BetaDemo'])).map((b) => b.key)).toEqual(['BetaDemo']);
    expect(testingApps(roster, HULL, new Set())).toEqual([]);
    // On the list but cut off live: no tab offering a door that refuses them.
    expect(testingApps(roster, GONE, new Set(['BetaDemo']))).toEqual([]);
  });
});

describe('beta apps stay out of every ordinary list', () => {
  it('each has its own key, and is a new version of a live, roster-governed app', () => {
    for (const b of BETA_APPS) {
      expect(CATALOGUE.map((a) => a.key)).not.toContain(b.key);
      expect(CATALOGUE.find((a) => a.key === b.base)?.governed).toBe(true);
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
