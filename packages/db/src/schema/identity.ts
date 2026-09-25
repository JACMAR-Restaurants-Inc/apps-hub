/**
 * identity: Better Auth's tables. Who is signed in, NOT what they may do; that is
 * rbac. Having a row here grants nothing (RBAC CLAUDE.md §2): anyone with a Google
 * account can sign in, so that someone not yet on the roster can ask for access.
 *
 * - Not called `auth`: Supabase already owns a schema by that name.
 * - The shape is Better Auth's core schema (1.7). Its ids are text it generates.
 * - `users.email` is the address as Google returned it. Better Auth finds a returning
 *   person by their Google account id, not by email, so it is left as given, and
 *   everything that joins it to the roster passes it through normalizeEmail first.
 * - Google's access, refresh and id tokens are NOT kept: we use Google only to learn
 *   who signed in. apps/web/src/lib/auth.ts blanks them before they are written, and
 *   the columns exist only because Better Auth expects them.
 * - Sessions and verifications are Better Auth's working state; it deletes expired
 *   ones itself. Nothing here is history, so the "nothing is deleted" rule does not
 *   apply to this schema, but there are still no cascades.
 */

import { boolean, index, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');

const at = () => timestamp({ withTimezone: true });

export const authUsers = identity.table('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull(),
  image: text(),
  createdAt: at().notNull().defaultNow(),
  updatedAt: at().notNull().defaultNow(),
}).enableRLS();

export const authSessions = identity.table(
  'sessions',
  {
    id: text().primaryKey(),
    expiresAt: at().notNull(),
    token: text().notNull().unique(),
    createdAt: at().notNull().defaultNow(),
    updatedAt: at().notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => authUsers.id),
  },
  (t) => [index().on(t.userId)],
).enableRLS();

export const authAccounts = identity.table(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => authUsers.id),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: at(),
    refreshTokenExpiresAt: at(),
    scope: text(),
    password: text(),
    createdAt: at().notNull().defaultNow(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), uniqueIndex().on(t.providerId, t.accountId)],
).enableRLS();

export const authVerifications = identity.table(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: at().notNull(),
    createdAt: at().notNull().defaultNow(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [index().on(t.identifier)],
).enableRLS();
