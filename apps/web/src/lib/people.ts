import 'server-only';
import { normalizeEmail } from '@hub/core';
import { users } from '@hub/db';
import { eq, inArray } from 'drizzle-orm';
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

/**
 * Who someone is in the access directory: their name and employee number, as checked in
 * Clearview when they asked for access. Through the same door: Forms files these with a
 * submission (owner, 2026-10-09), so nobody types a number that could be someone else's.
 */
export async function directoryPerson(email: string): Promise<{ email: string; fullName: string | null; employeeNumber: string | null }> {
  const e = normalizeEmail(email);
  const [row] = await db().select({ fullName: users.fullName, employeeNumber: users.employeeNumber }).from(users).where(eq(users.email, e));
  return { email: e, fullName: row?.fullName ?? null, employeeNumber: row?.employeeNumber ?? null };
}

/** Everyone in the directory by name, for choosing people to share a form with. */
export async function directoryPeople(): Promise<{ email: string; name: string }[]> {
  const rows = await db().select({ email: users.email, name: users.fullName, active: users.active }).from(users);
  return rows
    .filter((r) => r.active)
    .map((r) => ({ email: normalizeEmail(r.email), name: r.name || r.email }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
