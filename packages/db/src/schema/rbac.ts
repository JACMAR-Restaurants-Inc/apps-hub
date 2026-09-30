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
  /**
   * The restaurant Clearview says they report to, saved when they ask for access, so
   * the Grant panel can open with it ticked (RBAC §48). A suggestion for the admin and
   * nothing else: can() never reads it.
   */
  clearviewStore: text(),
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
  /**
   * Emailed when somebody asks for access. Not a grant: every admin can grant either
   * way. If no admin has it on, the request email goes to the break-glass admin rather
   * than to nobody (RBAC Notify.gs): the wrong admin told beats no admin told.
   */
  notify: boolean().notNull().default(false),
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
    /**
     * When the "you now have access" email went. Stamped so it goes once (RBAC §31),
     * and cleared when somebody asks again, or a re-grant would never tell them (§45).
     */
    notifiedOn: timestamp({ withTimezone: true }),
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

/**
 * Beta testers (owner, 2026-09-30): who may try a beta app before it goes live. A row
 * is a PERMISSION TO TEST and nothing more: inside the beta, the tester's role and
 * restaurants are those they hold in the live app the beta is a new version of, read
 * fresh on every click (lib/beta). So a row grants nothing on its own, and removing
 * one cuts the tester off on their next click. Removal deletes the row (like an admins
 * row, it is a permission, not history); the audit keeps who, whom and when.
 */
export const betaTesters = rbac.table(
  'beta_testers',
  {
    /** The beta app's key (lib/beta/apps.ts), never a live app's. */
    app: text().notNull(),
    email: text()
      .notNull()
      .references(() => users.email),
    addedBy: text().notNull(),
    addedAt: stamp(),
  },
  (t) => [primaryKey({ columns: [t.app, t.email] })],
).enableRLS();
