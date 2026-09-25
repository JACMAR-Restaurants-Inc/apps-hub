import 'server-only';
import { normalizeEmail } from '@hub/core';
import { admins, users } from '@hub/db';
import { isSystemAdmin } from '@hub/rbac';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';
import { auth } from './auth';
import { db } from './db';

/**
 * Where a signed-in person stands on the roster. Signing in proves who someone is and
 * nothing more: 'not_on_roster' and 'inactive' people are signed in and see nothing
 * but the way to ask for access.
 */
export type RosterStanding = 'admin' | 'active' | 'inactive' | 'not_on_roster';

export interface Viewer {
  /** Normalised. The roster's join key. */
  email: string;
  name: string;
  standing: RosterStanding;
}

/**
 * Who is looking at this page, or null if nobody is signed in. Read fresh from the
 * database on every request, so deactivating someone takes effect on their next click,
 * not when their session expires. Cached per request only.
 *
 * This is for drawing pages. Server actions still call can() on every call.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // headers() first: it is what marks the page as per-request, so it is never prerendered.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const email = normalizeEmail(session.user.email);
  const [person, adminRows] = await Promise.all([
    db().select({ active: users.active }).from(users).where(eq(users.email, email)).limit(1),
    db().select({ email: admins.email }).from(admins),
  ]);

  // The same rule can() uses, break-glass address included.
  const admin = isSystemAdmin({ admins: new Set(adminRows.map((a) => normalizeEmail(a.email))) }, email);

  let standing: RosterStanding;
  if (admin) standing = 'admin';
  else if (!person[0]) standing = 'not_on_roster';
  else standing = person[0].active === true ? 'active' : 'inactive';

  return { email, name: session.user.name, standing };
});
