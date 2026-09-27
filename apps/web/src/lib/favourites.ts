/**
 * Favourites (owner's redesign, 2026-09-26): the apps a person starred, shown first on
 * Home. A star grants nothing and hides nothing; it only chooses what comes first.
 *
 * Only an app the person may SEE can be starred: a manager cannot star an admin-only
 * app, even by calling the action by hand. Stored per person in portal.favourites, so
 * it follows them from phone to laptop.
 */

import { favourites, type Db } from '@hub/db';
import { and, asc, eq } from 'drizzle-orm';
import { catalogueApp } from './catalogue';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

/** The same visibility the home page uses: admin-only apps for admins only. */
export function canSee(isAdmin: boolean, appKey: string): boolean {
  const app = catalogueApp(appKey);
  return Boolean(app) && (isAdmin || !app!.adminOnly);
}

export type FavouriteOutcome = 'done' | 'invalid';

export async function setFavourite(db: Conn, email: string, isAdmin: boolean, appKey: string, on: boolean): Promise<FavouriteOutcome> {
  if (!canSee(isAdmin, appKey)) return 'invalid';
  if (on) await db.insert(favourites).values({ email, app: appKey }).onConflictDoNothing();
  else await db.delete(favourites).where(and(eq(favourites.email, email), eq(favourites.app, appKey)));
  return 'done';
}

/** A person's starred app keys, oldest first (the order they were added). */
export async function listFavourites(db: Conn, email: string): Promise<string[]> {
  const rows = await db.select({ app: favourites.app }).from(favourites).where(eq(favourites.email, email)).orderBy(asc(favourites.addedAt));
  return rows.map((r) => r.app);
}
