import 'server-only';
import { audit } from '@hub/db';
import { authorizeWith } from './authorize-core';
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
  return authorizeWith(
    {
      signedInEmail: async () => (await getSignedInEmail())?.email ?? null,
      roster: getRoster,
      recordDenial: async (d) => {
        await db()
          .insert(audit)
          .values({ ...d, event: 'denied' });
      },
      log: (message, error) => console.error(message, error),
    },
    app,
    resource,
    action,
    storeId,
  );
}
