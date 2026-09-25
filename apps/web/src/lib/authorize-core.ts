import { explain, isSystemAdmin, type Decision, type RosterSnapshot } from '@hub/rbac';

export class AccessDenied extends Error {
  constructor(readonly reason: string) {
    super(`Access denied: ${reason}`);
    this.name = 'AccessDenied';
  }
}

export interface Denial {
  actorEmail: string;
  app: string;
  restaurantId: string | null;
  detail: { resource: string; action: string; reason: string };
}

/** What authorize() needs from the request and the database, injected so it is testable. */
export interface AuthorizeDeps {
  signedInEmail: () => Promise<string | null>;
  roster: () => Promise<RosterSnapshot>;
  recordDenial: (denial: Denial) => Promise<void>;
  log: (message: string, error: unknown) => void;
}

/** See authorize() in access.ts. Separate only so the rules are unit-tested. */
export async function authorizeWith(
  deps: AuthorizeDeps,
  app: string,
  resource: string,
  action: string,
  storeId?: string | null,
): Promise<{ email: string }> {
  let email: string | null = null;
  let decision: Decision;
  try {
    email = await deps.signedInEmail();
    decision = email
      ? explain(await deps.roster(), email, app, resource, action, storeId)
      : { allowed: false, reason: 'not_signed_in' };
  } catch (error) {
    deps.log('authorize: could not decide, denying', error);
    decision = { allowed: false, reason: 'error' };
  }

  if (decision.allowed && email) return { email };

  if (email) {
    try {
      await deps.recordDenial({
        actorEmail: email,
        app,
        restaurantId: storeId ?? null,
        detail: { resource, action, reason: decision.reason },
      });
    } catch (error) {
      // The denial stands whether or not it could be recorded.
      deps.log('authorize: could not audit a denial', error);
    }
  }
  throw new AccessDenied(decision.reason);
}

/**
 * For the admin screens: granting, changing and removing access. Only a system admin
 * may (RBAC §48, requireAdmin), decided by the same isSystemAdmin can() uses,
 * break-glass included. Same rules as authorizeWith: fails closed, audits a signed-in
 * refusal, never audits a caller with no session.
 */
export async function requireAdminWith(deps: AuthorizeDeps, action: string): Promise<{ email: string }> {
  let email: string | null = null;
  let reason: string;
  try {
    email = await deps.signedInEmail();
    if (!email) reason = 'not_signed_in';
    else if (isSystemAdmin(await deps.roster(), email)) return { email };
    else reason = 'not_admin';
  } catch (error) {
    deps.log('requireAdmin: could not decide, denying', error);
    reason = 'error';
  }
  if (email) {
    try {
      await deps.recordDenial({ actorEmail: email, app: 'portal', restaurantId: null, detail: { resource: 'admin', action, reason } });
    } catch (error) {
      deps.log('requireAdmin: could not audit a denial', error);
    }
  }
  throw new AccessDenied(reason);
}
