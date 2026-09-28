import 'server-only';
import { restaurants } from '@hub/db';
import { asc } from 'drizzle-orm';
import { cache } from 'react';
import { db } from './db';

/**
 * The restaurants list: part of the ONE narrow door an app uses to reach the portal's
 * data, with authorize()/can() and the roster (CLAUDE.md §3, "each app stays
 * separable"). Apps call this rather than joining rbac.restaurants in their own SQL,
 * so an app moved to its own database keeps working unchanged.
 * Read once per request, like the roster.
 */
export const listRestaurants = cache(async (): Promise<{ id: string; name: string; active: boolean }[]> => {
  const rows = await db().select().from(restaurants).orderBy(asc(restaurants.restaurantId));
  return rows.map((r) => ({ id: r.restaurantId, name: r.name, active: r.active }));
});
