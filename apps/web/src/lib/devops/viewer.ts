import 'server-only';
import { isSystemAdmin } from '@hub/rbac';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { listAdmins } from '../people';
import { getRoster, getSignedInEmail } from '../viewer';

/**
 * Who is using JM DevOps. System admins only (owner, 2026-09-29): anyone else gets
 * null and sees that it is for administrators. For DRAWING only: every action still
 * calls requireSystemAdmin().
 * `people`: who an issue can be assigned to, the admins, with their names.
 */
export interface DevopsViewer {
  email: string;
  people: { email: string; name: string }[];
}

export const getDevopsViewer = cache(async (): Promise<DevopsViewer | null> => {
  const who = await getSignedInEmail();
  if (!who) return null;
  if (!isSystemAdmin(await getRoster(), who.email)) return null;
  return { email: who.email, people: await listAdmins() };
});

/** A person's name for display: an admin's name, else the address itself. */
export function nameOf(people: DevopsViewer['people'], email: string | null): string | null {
  if (!email) return null;
  return people.find((p) => p.email === email)?.name ?? email;
}

/**
 * JM DevOps' own theme: light, the old app's look, unless the device or the avatar
 * menu says dark. A cookie, so the server draws the page in it and nothing flashes
 * (as Cash Balancing's cb_theme).
 */
export const DEVOPS_THEME_COOKIE = 'dv_theme';

export async function getDevopsTheme(): Promise<'light' | 'dark' | null> {
  const v = (await cookies()).get(DEVOPS_THEME_COOKIE)?.value;
  return v === 'light' || v === 'dark' ? v : null;
}
