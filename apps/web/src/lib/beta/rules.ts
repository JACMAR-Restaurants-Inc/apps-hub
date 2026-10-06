import { normalizeEmail } from '@hub/core';
import { explain, isSystemAdmin, memberKey, type Decision, type RosterSnapshot } from '@hub/rbac';
import { BETA_APPS, betaApp, isConsole, type BetaApp } from './apps';

/**
 * Who may do what in a beta app. Pure: the roster and the tester list come in, so every
 * rule is tested without a database (rules.test.ts).
 *
 * The order is the contract, like can()'s:
 * 1. an unknown beta denies;
 * 2. a system admin tests everything, with no tester row (they pass every can());
 * 3. anyone else must be on the beta's tester list;
 * 4. then can() decides, on the LIVE app, with their role and restaurants there; for a
 *    brand-new app (no base), on the beta's own permissions, as if they held it with
 *    their role and restaurants, for as long as they hold ANY live app (ownApp); for an
 *    Apps Script console (no base), only that they are switched on and hold any app: it
 *    has no permissions here, and the portal only decides who sees its card.
 * So a tester who loses the live app (or every app), is switched off, or is asked about
 * a restaurant they do not hold, is refused in the beta too, on their next click.
 */
export function betaDecision(
  roster: RosterSnapshot,
  email: string,
  isTester: boolean,
  betaKey: string,
  resource: string,
  action: string,
  storeId?: string | null,
): Decision {
  const beta = betaApp(betaKey);
  if (!beta) return { allowed: false, reason: 'no_such_beta' };
  if (!isSystemAdmin(roster, email) && !isTester) return { allowed: false, reason: 'not_tester' };
  if (beta.base) return explain(roster, email, beta.base, resource, action, storeId);
  if (isConsole(beta)) return consoleDecision(roster, email);
  return explain(ownApp(roster, email, beta.key), email, beta.key, resource, action, storeId);
}

/** Who sees an Apps Script console's card: an admin, or someone switched on who holds an app. */
function consoleDecision(roster: RosterSnapshot, email: string): Decision {
  const e = normalizeEmail(email);
  if (isSystemAdmin(roster, e)) return { allowed: true, reason: 'system_admin' };
  const person = roster.users.get(e);
  if (!person) return { allowed: false, reason: 'not_on_roster' };
  if (person.active !== true) return { allowed: false, reason: 'user_inactive' };
  const holds = [...roster.members].some(([k, m]) => k.endsWith(`|${e}`) && m.status === 'active');
  return holds ? { allowed: true, reason: 'tester' } : { allowed: false, reason: 'no_app_access' };
}

/**
 * The roster as if the person held this brand-new app, with their own role and
 * restaurants (the same in every app, owner 2026-10-06), active only while they hold
 * some live app. A copy: the roster itself is never changed.
 */
function ownApp(roster: RosterSnapshot, email: string, key: string): RosterSnapshot {
  const e = normalizeEmail(email);
  const person = roster.users.get(e);
  const holds = [...roster.members].some(([k, m]) => k.endsWith(`|${e}`) && m.status === 'active');
  const members = new Map(roster.members);
  members.set(memberKey(key, e), { role: person?.role ?? null, status: holds ? 'active' : 'revoked', stores: new Set(person?.stores) });
  return { ...roster, members };
}

/**
 * The betas a person sees on the Tests page, and whether they get the Tests menu at all:
 * every beta for a system admin; for anyone else, the ones they test AND can open, so
 * the tab never offers a door that refuses them.
 */
export function testingApps(roster: RosterSnapshot, email: string, testerOf: ReadonlySet<string>): BetaApp[] {
  return BETA_APPS.filter((b) => betaDecision(roster, email, testerOf.has(b.key), b.key, 'app', 'access').allowed);
}
