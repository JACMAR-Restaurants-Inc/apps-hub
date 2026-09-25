import { explain, type Decision, type RosterSnapshot } from '@hub/rbac';

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
