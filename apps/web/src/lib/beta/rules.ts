import { explain, isSystemAdmin, type Decision, type RosterSnapshot } from '@hub/rbac';
import { BETA_APPS, betaApp, type BetaApp } from './apps';

/**
 * Who may do what in a beta app. Pure: the roster and the tester list come in, so every
 * rule is tested without a database (rules.test.ts).
 *
 * The order is the contract, like can()'s:
 * 1. an unknown beta denies;
 * 2. a system admin tests everything, with no tester row (they pass every can());
 * 3. anyone else must be on the beta's tester list;
 * 4. then can() decides, on the LIVE app, with their role and restaurants there.
 * So a tester who loses the live app, is switched off, or is asked about a restaurant
 * they do not hold, is refused in the beta too, on their next click.
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
  return explain(roster, email, beta.base, resource, action, storeId);
}

/**
 * The betas a person sees on the Tests page, and whether they get the Tests menu at all:
 * every beta for a system admin; for anyone else, the ones they test AND can open, so
 * the tab never offers a door that refuses them.
 */
export function testingApps(roster: RosterSnapshot, email: string, testerOf: ReadonlySet<string>): BetaApp[] {
  return BETA_APPS.filter((b) => betaDecision(roster, email, testerOf.has(b.key), b.key, 'app', 'access').allowed);
}
