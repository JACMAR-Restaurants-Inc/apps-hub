import 'server-only';
import { normalizeEmail } from '@hub/core';
import { authAccounts, authSessions, authUsers, authVerifications, loadRoster } from '@hub/db';
import { isSystemAdmin } from '@hub/rbac';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { eq } from 'drizzle-orm';
import { authOptions, readAuthEnv } from './auth-options';
import { db } from './db';
import { journalUnderLimit } from './rate-limit';

/**
 * "Signed in with no grants" (RBAC §72): somebody signed in whom the roster admits to
 * nothing. Written at sign-in, once per session, so an admin reading the log can see who
 * came to the door and found it shut, often the wrong Google account. Never throws: a
 * log that could fail must not stop anybody signing in.
 */
async function auditNoGrants(userId: string) {
  try {
    const [u] = await db().select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, userId));
    if (!u) return;
    const email = normalizeEmail(u.email);
    const roster = await loadRoster(db());
    if (isSystemAdmin(roster, email)) return;
    const person = roster.users.get(email);
    const holds = person?.active === true && [...roster.members.entries()].some(([k, m]) => k.endsWith(`|${email}`) && m.status === 'active');
    if (holds) return;
    // Anyone can sign in, again and again: at most LIMITS.noGrantsAudit rows an hour each.
    await journalUnderLimit(db(), 'noGrantsAudit', { actorEmail: email, event: 'signed_in_no_grants', targetEmail: email, detail: { onRoster: Boolean(person) } });
  } catch (error) {
    console.error('auditNoGrants failed', error);
  }
}

function createAuth() {
  const options = authOptions(readAuthEnv());
  return betterAuth({
    ...options,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    databaseHooks: {
      ...options.databaseHooks,
      session: { create: { after: async (session) => void (await auditNoGrants(session.userId)) } },
    },
    // Lets server actions set the session cookie. Must stay last.
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Built on first use, for the same reason as db(). */
export function auth() {
  return (instance ??= createAuth());
}
