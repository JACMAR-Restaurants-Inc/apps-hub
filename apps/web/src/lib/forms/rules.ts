import { normalizeEmail } from '@hub/core';
import { can, isSystemAdmin, type Role, type RosterSnapshot } from '@hub/rbac';

/**
 * Who may fill, edit and read a form. Pure: the roster comes in, so every rule is tested
 * without a database (rules.test.ts).
 *
 * FILLING is decided by the form's audience, not by holding the Forms app (owner,
 * 2026-10-09): HR shares a form with roles (optionally only at some restaurants) and/or
 * with people chosen from the access directory. Read fresh on every click, so it follows
 * the directory: someone made a Gérant next week sees a form shared with Gérants, and
 * someone switched off, or holding no app any more, stops seeing it. A system admin
 * sees every form that is open.
 *
 * EDITING and READING RESPONSES go through can() on the Forms app (FORMS_APP), whose
 * permissions are rows like every app's (migration 0017):
 *   form / edit             global  office            create, edit, share, close
 *   responses / view_all    global  office            every restaurant's
 *   responses / view        store   office, manager   one restaurant's (owner: managers
 *                                                      see their own restaurants')
 *   app / access            global  all three         open the app at all
 * A system admin passes all of them.
 */

export const FORMS_APP = 'Forms';

export interface Audience {
  roles: Role[];
  /** Narrows `roles` to these restaurants; empty means every restaurant. */
  stores: string[];
  /** Chosen people, by normalised address, whatever their role. */
  people: string[];
}

export const NOBODY: Audience = { roles: [], stores: [], people: [] };
const ROLES: readonly Role[] = ['office', 'manager', 'viewer'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** A stored or sent audience, cleaned: unknown roles and blanks dropped, emails normalised. */
export function parseAudience(raw: unknown): Audience {
  if (!isObj(raw)) return NOBODY;
  const roles = ROLES.filter((r) => strings(raw.roles).includes(r));
  const stores = [...new Set(strings(raw.stores).map((s) => s.trim()).filter(Boolean))].sort();
  const people = [...new Set(strings(raw.people).map(normalizeEmail).filter((e) => e.includes('@')))].sort();
  return { roles, stores, people };
}

export const isShared = (a: Audience) => a.roles.length > 0 || a.people.length > 0;

/** Switched on and holding at least one app: what "in the access directory" means here. */
function inDirectory(roster: RosterSnapshot, e: string) {
  const person = roster.users.get(e);
  if (!person || person.active !== true) return null;
  const holds = [...roster.members].some(([k, m]) => k.endsWith(`|${e}`) && m.status === 'active');
  return holds ? person : null;
}

export type FillDecision = { allowed: true; stores: string[] } | { allowed: false; reason: string };

/**
 * May this person fill this form, and for which of their restaurants? The order:
 * a form not open denies; a system admin may (any active restaurant they hold, or none);
 * otherwise they must be switched on and hold an app, then be chosen by name, or hold a
 * shared role (at a shared restaurant, when the share names restaurants).
 * `stores`: what they may submit for, their active restaurants (within the share's
 * when it is by role only).
 */
export function fillDecision(roster: RosterSnapshot, email: string, status: string, audience: Audience): FillDecision {
  try {
    const e = normalizeEmail(email);
    if (status !== 'open') return { allowed: false, reason: 'not_open' };
    const activeStores = (s: Iterable<string> | undefined) => [...(s ?? [])].filter((id) => roster.restaurants.get(id)?.active === true).sort();
    if (isSystemAdmin(roster, e)) return { allowed: true, stores: activeStores(roster.users.get(e)?.stores) };
    const person = inDirectory(roster, e);
    if (!person) return { allowed: false, reason: 'not_in_directory' };
    const held = activeStores(person.stores);
    if (audience.people.includes(e)) return { allowed: true, stores: held };
    if (!person.role || !audience.roles.includes(person.role)) return { allowed: false, reason: 'not_shared' };
    if (!audience.stores.length) return { allowed: true, stores: held };
    const within = held.filter((s) => audience.stores.includes(s));
    return within.length ? { allowed: true, stores: within } : { allowed: false, reason: 'not_shared' };
  } catch {
    return { allowed: false, reason: 'error' };
  }
}

/** The restaurant a submission is filed under: one they may submit for, or none if they hold none. */
export function pickStore(decision: FillDecision, asked: unknown): string | null | 'invalid' {
  if (!decision.allowed) return 'invalid';
  if (!decision.stores.length) return asked == null || asked === '' ? null : 'invalid';
  if (decision.stores.length === 1 && (asked == null || asked === '')) return decision.stores[0];
  return typeof asked === 'string' && decision.stores.includes(asked) ? asked : 'invalid';
}

export const canEditForms = (roster: RosterSnapshot, email: string) => can(roster, email, FORMS_APP, 'form', 'edit');

/**
 * Which submissions this person may read: 'all', the restaurants they may read, or
 * nothing. A submission with no restaurant (an admin's own) is in 'all' only.
 */
export function responsesScope(roster: RosterSnapshot, email: string): 'all' | string[] {
  if (can(roster, email, FORMS_APP, 'responses', 'view_all')) return 'all';
  const e = normalizeEmail(email);
  const stores = [...(roster.users.get(e)?.stores ?? [])].sort();
  return stores.filter((s) => can(roster, e, FORMS_APP, 'responses', 'view', s));
}

export const mayRead = (scope: 'all' | string[], restaurantId: string | null) => scope === 'all' || (restaurantId !== null && scope.includes(restaurantId));

/**
 * Who a share newly reaches: in the directory, not an admin (an admin sees every form
 * anyway), able to fill under `after` and not under `before`. They are told once, in
 * Notifications; nobody is told twice for the same form by widening it again.
 */
export function newlyReached(roster: RosterSnapshot, before: Audience, after: Audience): string[] {
  const out: string[] = [];
  for (const email of roster.users.keys()) {
    if (isSystemAdmin(roster, email)) continue;
    if (fillDecision(roster, email, 'open', after).allowed && !fillDecision(roster, email, 'open', before).allowed) out.push(email);
  }
  return out.sort();
}
