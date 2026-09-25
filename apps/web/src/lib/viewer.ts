import 'server-only';
import { normalizeEmail } from '@hub/core';
import { loadRoster } from '@hub/db';
import { isSystemAdmin, type RosterSnapshot } from '@hub/rbac';
import { headers } from 'next/headers';
import { cache } from 'react';
import { auth } from './auth';
import { db } from './db';

/**
 * The roster, loaded once per request and shared by everything that request draws or
 * decides (RBAC §79: read each table once). Never cached across requests, so
 * deactivating someone takes effect on their next click.
 */
export const getRoster = cache((): Promise<RosterSnapshot> => loadRoster(db()));

/**
 * The signed-in person's normalised email, or null. Better Auth keeps Google's address
 * as given; this is the one place it is turned into the roster's join key.
 */
export const getSignedInEmail = cache(async (): Promise<{ email: string; name: string } | null> => {
  // headers() first: it is what marks the page as per-request, so it is never prerendered.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { email: normalizeEmail(session.user.email), name: session.user.name };
});

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
 * Who is looking at this page, or null if nobody is signed in. For drawing pages only:
 * decisions go through authorize() (access.ts), which calls can().
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const who = await getSignedInEmail();
  if (!who) return null;
  const roster = await getRoster();

  let standing: RosterStanding;
  if (isSystemAdmin(roster, who.email)) standing = 'admin';
  else {
    const person = roster.users.get(who.email);
    if (!person) standing = 'not_on_roster';
    else standing = person.active === true ? 'active' : 'inactive';
  }
  return { ...who, standing };
});
