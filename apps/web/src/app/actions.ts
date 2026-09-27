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
import { restaurants as restaurantsTable } from '@hub/db';
import { explain } from '@hub/rbac';
import { db } from '@/lib/db';
import { APPS } from '@/lib/requests/apps';
import { getRoster, getSignedInEmail } from '@/lib/viewer';
import { addAdmin, addRestaurant, deletePerson, portalAllows, removeAdmin, setAdminNotify, setPersonActive, setRestaurantActive, type SettingsOutcome } from '@/lib/admin/settings';

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
  /** 'expired': no session any more (signed out or timed out), as opposed to 'denied': signed in, not an admin. */
  outcome: AdminOutcome | 'denied' | 'expired' | 'error' | null;
}

/** An AccessDenied for want of a session reads as "sign in again", not "not an admin". */
const refusal = (e: AccessDenied) => (e.reason === 'not_signed_in' ? 'expired' : 'denied');

/** grant | update | decline | revoke, from the Grant panel. */
export async function adminAccessAction(_: AdminState, form: FormData): Promise<AdminState> {
  const intent = str(form.get('intent'), 10);
  let admin: string;
  try {
    ({ email: admin } = await requireSystemAdmin(intent ?? 'unknown'));
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
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

export interface Check {
  app: string;
  kind: 'app' | 'admin_panel' | 'consolidated' | 'count';
  storeId: string;
  allowed: boolean;
  reason: string;
}

/**
 * "What can they actually do?" (§48): can() asked the questions that matter, for one
 * person, right now, with its reason. Admins only; read-only.
 */
export async function explainAction(rawEmail: string): Promise<Check[] | { denied: true; expired: boolean }> {
  try {
    await requireSystemAdmin('explain');
  } catch (e) {
    if (e instanceof AccessDenied) return { denied: true, expired: e.reason === 'not_signed_in' };
    throw e;
  }
  if (typeof rawEmail !== 'string' || rawEmail.length > 320) return [];
  const email = normalizeEmail(rawEmail);
  const roster = await getRoster();
  const ids = (await db().select({ id: restaurantsTable.restaurantId }).from(restaurantsTable))
    .map((r) => r.id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out: Check[] = [];
  for (const app of APPS) {
    for (const [kind, resource, action] of [
      ['app', 'app', 'access'],
      ['admin_panel', 'admin_panel', 'access'],
      ['consolidated', 'dashboard_consolidated', 'view'],
    ] as const) {
      const d = explain(roster, email, app.key, resource, action);
      out.push({ app: app.name.fr, kind, storeId: '', allowed: d.allowed, reason: d.reason });
    }
    for (const id of ids) {
      const d = explain(roster, email, app.key, 'count', 'create', id);
      out.push({ app: app.name.fr, kind: 'count', storeId: id, allowed: d.allowed, reason: d.reason });
    }
  }
  return out;
}

export type SettingsIntent = 'person_delete' | 'person_active' | 'admin_add' | 'admin_remove' | 'admin_notify' | 'restaurant_add' | 'restaurant_active';

/**
 * The spreadsheet's jobs (parity checklist D): the kill switch, admins and notify, and
 * restaurants. System admins only; every argument checked; each change audited.
 */
export async function settingsAction(
  intent: SettingsIntent,
  args: { email?: string; name?: string; id?: string; on?: boolean; confirm?: string },
): Promise<{ outcome: SettingsOutcome | 'denied' | 'expired' | 'error' }> {
  let admin: string;
  try {
    ({ email: admin } = await requireSystemAdmin(`settings:${intent}`));
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    throw e;
  }
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '');
  const on = args?.on === true;
  // Refused here, not only hidden on the page: an action is callable with anything.
  if (!portalAllows(intent, on)) return { outcome: 'invalid' };
  try {
    const d = db();
    let outcome: SettingsOutcome;
    switch (intent) {
      case 'person_delete':
        outcome = await deletePerson(d, admin, s(args.email, 320), s(args.confirm, 320));
        break;
      case 'person_active':
        outcome = await setPersonActive(d, admin, s(args.email, 320), on);
        break;
      case 'admin_add':
        outcome = await addAdmin(d, admin, s(args.email, 320), s(args.name, 120));
        break;
      case 'admin_remove':
        outcome = await removeAdmin(d, admin, s(args.email, 320));
        break;
      case 'admin_notify':
        outcome = await setAdminNotify(d, admin, s(args.email, 320), on);
        break;
      case 'restaurant_add':
        outcome = await addRestaurant(d, admin, s(args.id, 12), s(args.name, 80));
        break;
      case 'restaurant_active':
        outcome = await setRestaurantActive(d, admin, s(args.id, 12), on);
        break;
      default:
        return { outcome: 'invalid' };
    }
    revalidatePath('/', 'layout');
    return { outcome };
  } catch (error) {
    console.error('settingsAction failed', error);
    return { outcome: 'error' };
  }
}
