/**
 * rbac: who may do what, in every app. Ported from the "Access Control - Data"
 * spreadsheet (RBAC CLAUDE.md §4). The rules survive the move; some get stronger:
 *
 * - "A blank cell never grants anything" is now NOT NULL. A row cannot be written
 *   without asserting active / status explicitly, so the fail-safe is enforced by the
 *   database instead of remembered by every write path.
 * - Restaurant-per-column becomes one row per (app, person, restaurant) in
 *   member_stores. Presence is the grant; there is no "denied" value to mistype.
 * - Nothing is deleted: people are deactivated and memberships revoked. There are no
 *   ON DELETE CASCADE rules, so a careless delete fails loudly instead of taking
 *   history with it.
 */

import { sql } from 'drizzle-orm';
import { bigint, boolean, foreignKey, jsonb, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const rbac = pgSchema('rbac');

export const roleEnum = rbac.enum('role', ['office', 'manager', 'viewer']);
export const memberStatusEnum = rbac.enum('member_status', ['pending', 'active', 'revoked']);
export const scopeEnum = rbac.enum('scope', ['global', 'store', 'consolidated']);

const stamp = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** One row per person. `active` is the global kill switch. */
export const users = rbac.table('users', {
  /** The Google sign-in address, normalised (see @hub/core normalizeEmail). The join key everywhere. */
  email: text().primaryKey(),
  /** What HR / Clearview hold. Never an authorisation input; used to find people when offboarding. */
  hrEmail: text(),
  fullName: text(),
  /** Clearview employee number. A STRING: they carry leading zeros. */
  employeeNumber: text(),
  active: boolean().notNull(),
  addedAt: stamp(),
  addedBy: text(),
}).enableRLS();

/** The stores. The one list every app scopes by. */
export const restaurants = rbac.table('restaurants', {
  restaurantId: text().primaryKey(),
  name: text().notNull(),
  active: boolean().notNull(),
}).enableRLS();

/** System admins. Bypass can() in every app. See BREAK_GLASS_ADMIN in @hub/rbac. */
export const admins = rbac.table('admins', {
  email: text()
    .primaryKey()
    .references(() => users.email),
  addedAt: stamp(),
  addedBy: text(),
}).enableRLS();

/** One row per person WITH access to an app. No row = no access. A request is a 'pending' row. */
export const appMembers = rbac.table(
  'app_members',
  {
    app: text().notNull(),
    email: text()
      .notNull()
      .references(() => users.email),
    role: roleEnum(),
    status: memberStatusEnum().notNull(),
    grantedBy: text(),
    lastModified: stamp(),
  },
  (t) => [primaryKey({ columns: [t.app, t.email] })],
).enableRLS();

/** Which restaurants a member holds in an app. A row is a grant. */
export const memberStores = rbac.table(
  'member_stores',
  {
    app: text().notNull(),
    email: text().notNull(),
    restaurantId: text()
      .notNull()
      .references(() => restaurants.restaurantId),
  },
  (t) => [
    primaryKey({ columns: [t.app, t.email, t.restaurantId] }),
    foreignKey({ columns: [t.app, t.email], foreignColumns: [appMembers.app, appMembers.email] }),
  ],
).enableRLS();

/** What exists to be permitted, per app. resource+action is the key; scope is an attribute. */
export const permissions = rbac.table(
  'permissions',
  {
    app: text().notNull(),
    resource: text().notNull(),
    action: text().notNull(),
    scope: scopeEnum().notNull(),
  },
  (t) => [primaryKey({ columns: [t.app, t.resource, t.action] })],
).enableRLS();

/** Which roles hold a permission. A row is a grant. */
export const permissionRoles = rbac.table(
  'permission_roles',
  {
    app: text().notNull(),
    resource: text().notNull(),
    action: text().notNull(),
    role: roleEnum().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.app, t.resource, t.action, t.role] }),
    foreignKey({
      columns: [t.app, t.resource, t.action],
      foreignColumns: [permissions.app, permissions.resource, permissions.action],
    }),
  ],
).enableRLS();

/**
 * Denials, admin actions, grant changes and access requests (RBAC CLAUDE.md §7).
 * Not every check: logging every can() is the expensive answer. Append-only.
 */
export const audit = rbac.table('audit', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  at: stamp(),
  actorEmail: text(),
  app: text(),
  event: text().notNull(),
  targetEmail: text(),
  restaurantId: text(),
  /** Before/after values for a change. Never SIN, address or birth date. */
  detail: jsonb().notNull().default(sql`'{}'::jsonb`),
}).enableRLS();
