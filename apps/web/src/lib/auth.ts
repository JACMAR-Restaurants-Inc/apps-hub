import 'server-only';
import { authAccounts, authSessions, authUsers, authVerifications } from '@hub/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { authOptions, readAuthEnv } from './auth-options';
import { db } from './db';

function createAuth() {
  return betterAuth({
    ...authOptions(readAuthEnv()),
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    // Lets server actions set the session cookie. Must stay last.
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Built on first use, for the same reason as db(). */
export function auth() {
  return (instance ??= createAuth());
}
