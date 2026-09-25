'use server';

/**
 * The portal's server actions. Each is a PUBLIC endpoint: anyone can call it with any
 * arguments, whatever the page shows (CLAUDE.md §3). So each one first establishes who
 * is acting, then checks every argument's shape before using it.
 */

import { normalizeEmail } from '@hub/core';
import type { Role } from '@hub/rbac';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { AccessDenied, requireSystemAdmin } from '@/lib/access';
import { LANG_COOKIE } from '@/lib/i18n';
import { accessDeps } from '@/lib/requests/deps';
import { endAccess, grantAccess, requestAccess, updateAccess, type AdminOutcome, type RequestOutcome } from '@/lib/requests/service';
import { getSignedInEmail } from '@/lib/viewer';

const ROLES: readonly Role[] = ['office', 'manager', 'viewer'];
const str = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

export interface RequestState {
  outcome: RequestOutcome | 'not_signed_in' | 'error' | null;
  /** What they typed, so a refusal puts the form back with it (RBAC §65). */
  employeeNumber: string;
}

export async function requestAccessAction(_: RequestState, form: FormData): Promise<RequestState> {
  const app = str(form.get('app'), 40);
  const employeeNumber = str(form.get('employeeNumber'), 20) ?? '';
  const who = await getSignedInEmail().catch(() => null);
  if (!who) return { outcome: 'not_signed_in', employeeNumber };
  if (!app) return { outcome: 'unknown_app', employeeNumber };
  try {
    const outcome = await requestAccess(accessDeps(), who.email, app, employeeNumber);
    if (outcome === 'pending' || outcome === 'duplicate') revalidatePath('/');
    return { outcome, employeeNumber };
  } catch (error) {
    // Never a cheerful "sent" for something that did not happen (RBAC §15 item 16).
    console.error('requestAccessAction failed', error);
    return { outcome: 'error', employeeNumber };
  }
}

export interface AdminState {
  outcome: AdminOutcome | 'denied' | 'error' | null;
}

/** grant | update | decline | revoke, from the Grant panel. */
export async function adminAccessAction(_: AdminState, form: FormData): Promise<AdminState> {
  const intent = str(form.get('intent'), 10);
  let admin: string;
  try {
    ({ email: admin } = await requireSystemAdmin(intent ?? 'unknown'));
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: 'denied' };
    throw e;
  }

  const app = str(form.get('app'), 40);
  const rawEmail = str(form.get('email'), 320);
  const role = str(form.get('role'), 10);
  const stores = form.getAll('stores').filter((s): s is string => typeof s === 'string' && /^[A-Za-z0-9]{1,12}$/.test(s));
  if (!app || !rawEmail || stores.length > 50) return { outcome: 'invalid' };
  const email = normalizeEmail(rawEmail);
  const validRole = ROLES.find((r) => r === role);

  try {
    const deps = accessDeps();
    let outcome: AdminOutcome;
    if (intent === 'grant' && validRole) outcome = await grantAccess(deps, admin, app, email, validRole, stores);
    else if (intent === 'update' && validRole) outcome = await updateAccess(deps, admin, app, email, validRole, stores);
    else if (intent === 'decline') outcome = await endAccess(deps, admin, app, email, 'pending');
    else if (intent === 'revoke') outcome = await endAccess(deps, admin, app, email, 'active');
    else return { outcome: 'invalid' };
    revalidatePath('/admin/access');
    revalidatePath('/');
    return { outcome };
  } catch (error) {
    console.error('adminAccessAction failed', error);
    return { outcome: 'error' };
  }
}

/** The language switch. Harmless for anyone to call: it only sets their own cookie. */
export async function setLanguage(lang: 'fr' | 'en') {
  (await cookies()).set(LANG_COOKIE, lang === 'en' ? 'en' : 'fr', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}
