import 'server-only';
import { audit } from '@hub/db';
import { authorizeBetaWith, authorizeWith, requireAdminWith, type AuthorizeDeps } from './authorize-core';
import { isTester } from './beta/testers';
import { db } from './db';
import { getRoster, getSignedInEmail } from './viewer';

export { AccessDenied } from './authorize-core';

/**
 * The first line of every server action. A server action is a public endpoint that
 * anyone can call with any arguments (safe-count §3), so the page having hidden the
 * button proves nothing.
 *
 *   const { email } = await authorize('cash', 'count', 'create', count.restaurantId);
 *
 * Where the action touches an existing record, pass the restaurant ON THE RECORD, read
 * from the database, never one the caller sent.
 *
 * Returns who is acting, or throws AccessDenied. Fails closed: if the session or the
 * roster cannot be read, that is a denial. Denials by signed-in people are written to
 * rbac.audit (RBAC §7); grants are not, and neither are calls with no session, which
 * carry no identity worth keeping and would let anyone grow the table.
 */
export function authorize(app: string, resource: string, action: string, storeId?: string | null) {
  return authorizeWith(deps(), app, resource, action, storeId);
}

/**
 * The first line of every server action in a BETA app, in place of authorize(): the
 * caller must be one of its testers (or a system admin), and then can() decides on the
 * live app it is a new version of, with their role and restaurants there
 * (lib/beta/rules.ts). Same contract: fails closed, audits signed-in refusals.
 *
 *   const { email } = await authorizeBeta('BetaDemo', 'count', 'create', storeId);
 */
export function authorizeBeta(betaKey: string, resource: string, action: string, storeId?: string | null) {
  return authorizeBetaWith({ ...deps(), isTester: (email, key) => isTester(db(), email, key) }, betaKey, resource, action, storeId);
}

/** The first line of every admin action: only a system admin passes. */
export function requireSystemAdmin(action: string) {
  return requireAdminWith(deps(), action);
}

function deps(): AuthorizeDeps {
  return {
    signedInEmail: async () => (await getSignedInEmail())?.email ?? null,
    roster: getRoster,
    recordDenial: async (d) => {
      await db()
        .insert(audit)
        .values({ ...d, event: 'denied' });
    },
    log: (message, error) => console.error(message, error),
  };
}
