/**
 * can() / explain(): the authorisation contract, ported from the RBAC library
 * (RBAC CLAUDE.md §6). The ORDER of the checks and the fail-closed rule are the
 * contract; the storage underneath changed from a spreadsheet to Postgres.
 *
 * This file is pure: it decides against a RosterSnapshot and never touches the
 * database, so every rule is unit-tested without one. Loading the snapshot is the
 * db package's job.
 *
 * Resolution order:
 *   1. system admin                                   -> allow
 *   2. user exists and is active                      -> else deny
 *   3. member of this app with status 'active'        -> else deny
 *   4. a permission row for resource+action           -> else deny
 *   5. scope 'store': a store was named, the store is active,
 *      and the person holds it                        -> else deny
 *   6. the person's role is granted that permission   -> else deny
 * Any exception denies.
 */

import { normalizeEmail } from '@hub/core';

export type Role = 'office' | 'manager' | 'viewer';
export type Scope = 'global' | 'store' | 'consolidated';
export type MemberStatus = 'pending' | 'active' | 'revoked';

/**
 * The break-glass administrator (RBAC CLAUDE.md §5). Used ONLY when the admins table
 * is empty, so a wiped or broken admin list cannot lock everybody out. When the table
 * has anyone in it, this address is an ordinary user.
 */
export const BREAK_GLASS_ADMIN = 'sony@jacmar-restaurants.com';

export interface RosterSnapshot {
  /** Normalised emails of system admins. */
  admins: ReadonlySet<string>;
  /** Keyed by normalised email. */
  users: ReadonlyMap<string, { active: boolean }>;
  /** Keyed by restaurant id. */
  restaurants: ReadonlyMap<string, { active: boolean }>;
  /** Keyed by memberKey(app, email). */
  members: ReadonlyMap<string, { role: Role | null; status: MemberStatus; stores: ReadonlySet<string> }>;
  /** Keyed by permissionKey(app, resource, action). */
  permissions: ReadonlyMap<string, { scope: Scope; roles: ReadonlySet<Role> }>;
}

export const memberKey = (app: string, email: string) => `${app}|${normalizeEmail(email)}`;
export const permissionKey = (app: string, resource: string, action: string) => `${app}|${resource}|${action}`;

export interface Decision {
  allowed: boolean;
  reason: string;
}

export function isSystemAdmin(roster: RosterSnapshot, email: string): boolean {
  const e = normalizeEmail(email);
  if (roster.admins.size === 0) return e === BREAK_GLASS_ADMIN;
  return roster.admins.has(e);
}

export function explain(
  roster: RosterSnapshot,
  email: string,
  app: string,
  resource: string,
  action: string,
  storeId?: string | null,
): Decision {
  try {
    const e = normalizeEmail(email);
    if (!e) return { allowed: false, reason: 'no_email' };

    if (isSystemAdmin(roster, e)) return { allowed: true, reason: 'system_admin' };

    const user = roster.users.get(e);
    if (!user) return { allowed: false, reason: 'not_on_roster' };
    if (user.active !== true) return { allowed: false, reason: 'user_inactive' };

    const member = roster.members.get(memberKey(app, e));
    if (!member) return { allowed: false, reason: 'no_app_access' };
    if (member.status !== 'active') return { allowed: false, reason: `app_status_${member.status}` };

    const perm = roster.permissions.get(permissionKey(app, resource, action));
    if (!perm) return { allowed: false, reason: 'no_such_permission' };

    if (perm.scope === 'store') {
      const store = storeId == null ? '' : String(storeId).trim();
      if (!store) return { allowed: false, reason: 'store_required' };
      const restaurant = roster.restaurants.get(store);
      if (!restaurant || restaurant.active !== true) return { allowed: false, reason: 'store_inactive' };
      if (!member.stores.has(store)) return { allowed: false, reason: 'store_not_held' };
    }

    if (!member.role || !perm.roles.has(member.role)) return { allowed: false, reason: 'role_not_granted' };

    return { allowed: true, reason: 'granted' };
  } catch {
    // Fail closed: an error must never read as permission.
    return { allowed: false, reason: 'error' };
  }
}

export function can(
  roster: RosterSnapshot,
  email: string,
  app: string,
  resource: string,
  action: string,
  storeId?: string | null,
): boolean {
  return explain(roster, email, app, resource, action, storeId).allowed;
}
