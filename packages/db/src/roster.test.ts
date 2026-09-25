import { explain, type RosterSnapshot } from '@hub/rbac';
import { describe, expect, it } from 'vitest';
import { buildRoster, type RosterRows } from './roster';

const APP = 'cash';

// Rows as the tables hold them. Decisions are asserted through explain(), so these
// test what the loader means for access, not how it lays out its maps.
function rows(overrides: Partial<RosterRows> = {}): RosterRows {
  return {
    users: [
      { email: 'jane.doe@gmail.com', active: true },
      { email: 'office@jacmar-restaurants.com', active: true },
      { email: 'pending@gmail.com', active: true },
    ],
    admins: [],
    restaurants: [
      { restaurantId: '1647', active: true },
      { restaurantId: '3472', active: true },
    ],
    members: [
      { app: APP, email: 'jane.doe@gmail.com', role: 'manager', status: 'active' },
      { app: APP, email: 'office@jacmar-restaurants.com', role: 'office', status: 'active' },
      { app: APP, email: 'pending@gmail.com', role: null, status: 'pending' },
    ],
    memberStores: [
      { app: APP, email: 'jane.doe@gmail.com', restaurantId: '1647' },
      { app: APP, email: 'office@jacmar-restaurants.com', restaurantId: '1647' },
      { app: APP, email: 'office@jacmar-restaurants.com', restaurantId: '3472' },
    ],
    permissions: [
      { app: APP, resource: 'count', action: 'create', scope: 'store' },
      { app: APP, resource: 'count', action: 'view', scope: 'store' },
      { app: APP, resource: 'admin_panel', action: 'access', scope: 'global' },
      { app: APP, resource: 'nobody', action: 'holds', scope: 'global' },
    ],
    permissionRoles: [
      { app: APP, resource: 'count', action: 'create', role: 'manager' },
      { app: APP, resource: 'count', action: 'view', role: 'manager' },
      { app: APP, resource: 'count', action: 'view', role: 'office' },
      { app: APP, resource: 'admin_panel', action: 'access', role: 'office' },
    ],
    ...overrides,
  };
}

const why = (r: RosterSnapshot, email: string, resource: string, action: string, store?: string) =>
  explain(r, email, APP, resource, action, store).reason;

describe('buildRoster', () => {
  it('grants what the rows grant, store by store', () => {
    const r = buildRoster(rows());
    expect(why(r, 'jane.doe@gmail.com', 'count', 'create', '1647')).toBe('granted');
    expect(why(r, 'jane.doe@gmail.com', 'count', 'create', '3472')).toBe('store_not_held');
    expect(why(r, 'office@jacmar-restaurants.com', 'count', 'view', '1647')).toBe('granted');
    expect(why(r, 'office@jacmar-restaurants.com', 'count', 'view', '3472')).toBe('granted');
    expect(why(r, 'office@jacmar-restaurants.com', 'count', 'view', '9999')).toBe('store_inactive');
    expect(why(r, 'office@jacmar-restaurants.com', 'admin_panel', 'access')).toBe('granted');
    expect(why(r, 'jane.doe@gmail.com', 'admin_panel', 'access')).toBe('role_not_granted');
    expect(why(r, 'pending@gmail.com', 'count', 'create', '1647')).toBe('app_status_pending');
  });

  it('finds a Gmail user however the dots and case were typed, on either side', () => {
    const r = buildRoster(rows());
    expect(why(r, 'JaneDoe@Gmail.com', 'count', 'create', '1647')).toBe('granted');
    // Stored with capitals and dots by a hand edit: still the same person.
    const edited = buildRoster(
      rows({
        users: [{ email: ' Jane.Doe@GoogleMail.com ', active: true }],
        members: [{ app: APP, email: ' Jane.Doe@GoogleMail.com ', role: 'manager', status: 'active' }],
        memberStores: [{ app: APP, email: ' Jane.Doe@GoogleMail.com ', restaurantId: '1647' }],
      }),
    );
    expect(why(edited, 'janedoe@gmail.com', 'count', 'create', '1647')).toBe('granted');
  });

  it('treats two rows for one person as inactive, whichever order they come in', () => {
    for (const [first, second] of [
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const r = buildRoster(
        rows({
          users: [
            { email: 'jane.doe@gmail.com', active: first! },
            { email: 'janedoe@gmail.com', active: second! },
          ],
        }),
      );
      expect(why(r, 'janedoe@gmail.com', 'count', 'create', '1647')).toBe('user_inactive');
    }
  });

  it('keeps a permission nobody holds, so the reason is the true one', () => {
    expect(why(buildRoster(rows()), 'office@jacmar-restaurants.com', 'nobody', 'holds')).toBe('role_not_granted');
  });

  it('normalises admins, and an empty admins table falls back to break-glass', () => {
    const r = buildRoster(rows({ admins: [{ email: ' Office@Jacmar-Restaurants.com' }] }));
    expect(why(r, 'office@jacmar-restaurants.com', 'anything', 'at_all')).toBe('system_admin');
    expect(why(buildRoster(rows()), 'sony@jacmar-restaurants.com', 'anything', 'at_all')).toBe('system_admin');
  });

  it('an inactive restaurant grants nothing even to someone who holds it', () => {
    const r = buildRoster(rows({ restaurants: [{ restaurantId: '1647', active: false }] }));
    expect(why(r, 'jane.doe@gmail.com', 'count', 'create', '1647')).toBe('store_inactive');
  });
});
