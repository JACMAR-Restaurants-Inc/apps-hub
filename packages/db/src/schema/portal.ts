/**
 * portal: the portal's own per-person settings, apart from rbac (who may do what) and
 * from any app's data. Its own schema so it can move with the portal, as each app can
 * move with its own (CLAUDE.md §3, separable).
 *
 * favourites: the apps a person starred (owner's redesign, 2026-09-26). Keyed by the
 * normalised sign-in address, NOT a foreign key to rbac.users: somebody not yet on the
 * roster can star the app they are about to ask for. A star grants nothing; the home
 * page draws a favourite only if the person may see that app, in its real state.
 *
 * notifications: what the office decided about a person's access (owner, 2026-09-29):
 * granted, changed, declined. Written in the SAME transaction as the decision, so there
 * is never one without the other. Removal writes none (the owner's call; it emails
 * nobody either). Pending requests are not stored here: they are the pending rows. A
 * notification is not history (rbac.audit is): a read one is deleted 30 days after it
 * was read.
 */

import { index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const portal = pgSchema('portal');

export const favourites = portal.table(
  'favourites',
  {
    email: text().notNull(),
    app: text().notNull(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.email, t.app] })],
).enableRLS();

export const notifications = portal.table(
  'notifications',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    /** The person told, normalised. Not a foreign key, as for favourites. */
    email: text().notNull(),
    app: text().notNull(),
    /** 'granted' | 'changed' | 'declined' */
    kind: text().notNull(),
    /** What they now hold, for granted and changed: { role, stores }. */
    detail: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.email, t.createdAt)],
).enableRLS();
