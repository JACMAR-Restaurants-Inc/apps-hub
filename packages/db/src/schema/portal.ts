/**
 * portal: the portal's own per-person settings, apart from rbac (who may do what) and
 * from any app's data. Its own schema so it can move with the portal, as each app can
 * move with its own (CLAUDE.md §3, separable).
 *
 * favourites: the apps a person starred (owner's redesign, 2026-09-26). Keyed by the
 * normalised sign-in address, NOT a foreign key to rbac.users: somebody not yet on the
 * roster can star the app they are about to ask for. A star grants nothing; the home
 * page draws a favourite only if the person may see that app, in its real state.
 */

import { pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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
