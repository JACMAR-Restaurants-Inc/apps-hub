import 'server-only';
import { normalizeEmail } from '@hub/core';
import { users } from '@hub/db';
import { inArray } from 'drizzle-orm';
import { cache } from 'react';
import { db } from './db';
import { getRoster } from './viewer';

/**
 * The system admins, with their names: part of the ONE narrow door an app uses to reach
 * the portal's data (CLAUDE.md §3, "each app stays separable"), like listRestaurants().
 * JM DevOps is admins only, so these are its people: who can be assigned an issue.
 * Read once per request.
 */
export const listAdmins = cache(async (): Promise<{ email: string; name: string }[]> => {
  const emails = [...(await getRoster()).admins];
  if (!emails.length) return [];
  const rows = await db().select({ email: users.email, name: users.fullName }).from(users).where(inArray(users.email, emails));
  const names = new Map(rows.map((r) => [normalizeEmail(r.email), r.name]));
  return emails.map((email) => ({ email, name: names.get(email) || email })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
});
