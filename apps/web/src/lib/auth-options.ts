/**
 * Better Auth's configuration, kept apart from auth.ts so the rules in it are unit-tested
 * without a database or a server.
 *
 * Google is the only way in, and it is only an identity check: who is this? What they
 * may do is decided by the roster (rbac), never by having signed in (RBAC CLAUDE.md §2).
 *
 * - No `hd` (hosted domain). Floor managers work for McDonald's directly and cannot have
 *   Workspace accounts, and many use personal Gmail. Restricting the domain would lock
 *   out the people this is for.
 * - No passwords, no other providers, no account linking: one door.
 * - `select_account`: people often have several Google accounts signed in, and the one
 *   on the roster is not always the browser's default (RBAC CLAUDE.md §22).
 * - Google's tokens are blanked before they are written. We never call Google after
 *   sign-in, so a stored token would be a secret kept for nothing.
 */

import type { BetterAuthOptions } from 'better-auth';

export interface AuthEnv {
  secret: string;
  baseURL: string;
  googleClientId: string;
  googleClientSecret: string;
}

export function readAuthEnv(env: Record<string, string | undefined> = process.env): AuthEnv {
  const missing = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter(
    (k) => !env[k],
  );
  if (missing.length) throw new Error(`Sign-in is not configured: ${missing.join(', ')} not set`);
  return {
    secret: env.BETTER_AUTH_SECRET!,
    baseURL: env.BETTER_AUTH_URL!,
    googleClientId: env.GOOGLE_CLIENT_ID!,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}

/** Google's tokens, removed from an account row before it is stored. */
export function withoutTokens<T extends object>(account: T): T {
  return { ...account, accessToken: null, refreshToken: null, idToken: null } as T;
}

export function authOptions(env: AuthEnv): Omit<BetterAuthOptions, 'database'> {
  return {
    secret: env.secret,
    baseURL: env.baseURL,
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
        prompt: 'select_account',
      },
    },
    account: { accountLinking: { enabled: false } },
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: withoutTokens(account) }) },
        update: { before: async (account) => ({ data: withoutTokens(account) }) },
      },
    },
    telemetry: { enabled: false },
  };
}
