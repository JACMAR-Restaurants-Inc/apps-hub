/**
 * The roster loader: rbac's tables -> the RosterSnapshot that can() decides against.
 *
 * Loaded fresh for each request, never cached across requests: deactivating someone
 * must take effect on their next click, not when a cache expires. Seven small queries,
 * run in parallel.
 *
 * buildRoster is pure, so the rules below are tested without a database:
 * - Every email is normalised here, whatever is stored. Writes normalise too, but a
 *   hand edit in Supabase might not, and a spelling difference must not decide access.
 * - If two users rows normalise to the same address, nobody can say which is right, so
 *   that person is treated as INACTIVE (fail closed). Every other table's email is a
 *   foreign key to users, so a collision anywhere shows up here first.
 * - A permission no role holds is still a permission (empty set): can() then says
 *   role_not_granted, which is the true reason, rather than no_such_permission.
 */

import { normalizeEmail } from '@hub/core';
import {
  memberKey,
  permissionKey,
  type MemberStatus,
  type Role,
  type RosterSnapshot,
  type Scope,
} from '@hub/rbac';
import type { Db } from './client';
import { admins, appMembers, memberStores, permissionRoles, permissions, restaurants, users } from './schema';

export interface RosterRows {
  users: { email: string; active: boolean }[];
  admins: { email: string }[];
  restaurants: { restaurantId: string; active: boolean }[];
  members: { app: string; email: string; role: Role | null; status: MemberStatus }[];
  memberStores: { app: string; email: string; restaurantId: string }[];
  permissions: { app: string; resource: string; action: string; scope: Scope }[];
  permissionRoles: { app: string; resource: string; action: string; role: Role }[];
}

export function buildRoster(rows: RosterRows): RosterSnapshot {
  const userMap = new Map<string, { active: boolean }>();
  for (const u of rows.users) {
    const email = normalizeEmail(u.email);
    const seen = userMap.get(email);
    // A collision is ambiguous: deny rather than guess.
    userMap.set(email, { active: seen ? false : u.active === true });
  }

  const restaurantMap = new Map(rows.restaurants.map((r) => [r.restaurantId, { active: r.active === true }]));

  const memberMap = new Map<string, { role: Role | null; status: MemberStatus; stores: Set<string> }>();
  for (const m of rows.members) {
    const key = memberKey(m.app, m.email);
    const seen = memberMap.get(key);
    // Same collision rule. The user is already inactive, so this is belt and braces.
    memberMap.set(key, seen ? { role: null, status: 'revoked', stores: new Set() } : { role: m.role, status: m.status, stores: new Set() });
  }
  for (const s of rows.memberStores) {
    memberMap.get(memberKey(s.app, s.email))?.stores.add(s.restaurantId);
  }

  const permissionMap = new Map<string, { scope: Scope; roles: Set<Role> }>();
  for (const p of rows.permissions) {
    permissionMap.set(permissionKey(p.app, p.resource, p.action), { scope: p.scope, roles: new Set() });
  }
  for (const pr of rows.permissionRoles) {
    permissionMap.get(permissionKey(pr.app, pr.resource, pr.action))?.roles.add(pr.role);
  }

  return {
    admins: new Set(rows.admins.map((a) => normalizeEmail(a.email))),
    users: userMap,
    restaurants: restaurantMap,
    members: memberMap,
    permissions: permissionMap,
  };
}

export async function loadRoster(db: Db): Promise<RosterSnapshot> {
  const [u, a, r, m, ms, p, pr] = await Promise.all([
    db.select({ email: users.email, active: users.active }).from(users),
    db.select({ email: admins.email }).from(admins),
    db.select({ restaurantId: restaurants.restaurantId, active: restaurants.active }).from(restaurants),
    db
      .select({ app: appMembers.app, email: appMembers.email, role: appMembers.role, status: appMembers.status })
      .from(appMembers),
    db
      .select({ app: memberStores.app, email: memberStores.email, restaurantId: memberStores.restaurantId })
      .from(memberStores),
    db
      .select({ app: permissions.app, resource: permissions.resource, action: permissions.action, scope: permissions.scope })
      .from(permissions),
    db
      .select({
        app: permissionRoles.app,
        resource: permissionRoles.resource,
        action: permissionRoles.action,
        role: permissionRoles.role,
      })
      .from(permissionRoles),
  ]);
  return buildRoster({
    users: u,
    admins: a,
    restaurants: r,
    members: m,
    memberStores: ms,
    permissions: p,
    permissionRoles: pr,
  });
}
