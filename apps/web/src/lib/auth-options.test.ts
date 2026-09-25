import { describe, expect, it } from 'vitest';
import { authOptions, readAuthEnv, withoutTokens } from './auth-options';

const env = {
  secret: 'x'.repeat(32),
  baseURL: 'http://localhost:3000',
  googleClientId: 'id',
  googleClientSecret: 'secret',
};

describe('sign-in', () => {
  const options = authOptions(env);
  const google = options.socialProviders?.google as unknown as Record<string, unknown>;

  it('accepts any Google account: no hosted-domain restriction', () => {
    // Floor managers cannot have Workspace accounts (RBAC §2). The roster decides.
    expect(google).toBeDefined();
    expect(google.hd).toBeUndefined();
  });

  it('has Google as the only way in', () => {
    expect(Object.keys(options.socialProviders ?? {})).toEqual(['google']);
    expect(options.emailAndPassword?.enabled).toBe(false);
    expect(options.account?.accountLinking?.enabled).toBe(false);
  });

  it('lets people choose which Google account', () => {
    expect(google.prompt).toBe('select_account');
  });

  it('never stores Google tokens, on create or update', async () => {
    const row = { accountId: 'g-1', providerId: 'google', accessToken: 'a', refreshToken: 'r', idToken: 'i' };
    const hooks = options.databaseHooks?.account;
    for (const hook of [hooks?.create?.before, hooks?.update?.before]) {
      expect(hook).toBeDefined();
      const result = (await hook!(row as never, null)) as { data: typeof row };
      expect(result.data).toMatchObject({ accountId: 'g-1', accessToken: null, refreshToken: null, idToken: null });
    }
  });

  it('withoutTokens leaves everything else alone', () => {
    expect(withoutTokens({ userId: 'u', accessToken: 'a' })).toEqual({
      userId: 'u',
      accessToken: null,
      refreshToken: null,
      idToken: null,
    });
  });

  it('refuses to start with a setting missing, and names it', () => {
    expect(() => readAuthEnv({ BETTER_AUTH_SECRET: 's', BETTER_AUTH_URL: 'u', GOOGLE_CLIENT_ID: 'i' })).toThrow(
      'GOOGLE_CLIENT_SECRET',
    );
  });
});
