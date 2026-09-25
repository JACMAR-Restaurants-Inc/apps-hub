import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildMime, createGmail, readGmailEnv, signedAssertion, type GmailDeps, type GmailEnv } from './gmail';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const env = (over: Partial<GmailEnv> = {}): GmailEnv => ({
  clientEmail: 'mailer@apps-hub.iam.gserviceaccount.com',
  privateKey: pem,
  sender: 'sony@jacmar-restaurants.com',
  mode: 'test',
  testInbox: 'sony@jacmar-restaurants.com',
  testAllowlist: new Set(),
  ...over,
});

const msg = {
  to: ['manager@gmail.com'],
  subject: 'Vous avez maintenant accès à Cash Balancing',
  text: 'Bonjour : accès accordé.',
  html: '<p>Bonjour&nbsp;: accès accordé.</p>',
};

function fake(over: { token?: () => Response; send?: () => Response } = {}) {
  const sent: { raw: string; auth: string }[] = [];
  let tokens = 0;
  let clock = 1_750_000_000_000;
  const deps: GmailDeps = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('oauth2')) {
        tokens++;
        return over.token?.() ?? new Response(JSON.stringify({ access_token: `tok${tokens}` }));
      }
      sent.push({ raw: JSON.parse(String(init!.body)).raw, auth: String((init!.headers as Record<string, string>).authorization) });
      return over.send?.() ?? new Response(JSON.stringify({ id: 'm1' }));
    }) as typeof fetch,
    now: () => clock,
    boundary: () => 'B',
  };
  return { deps, sent, tokens: () => tokens, advance: (ms: number) => (clock += ms) };
}
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
const header = (mime: string, name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(mime)?.[1];

describe('send', () => {
  it('in test mode goes only to the test inbox, naming the real recipient', async () => {
    const f = fake();
    const r = await createGmail(env(), f.deps).send({ ...msg, cc: ['office@jacmar-restaurants.com'] });
    expect(r).toEqual({ sent: true, ids: ['m1'], redirected: true });
    const mime = decode(f.sent[0]!.raw);
    expect(header(mime, 'To')).toBe('sony@jacmar-restaurants.com');
    expect(header(mime, 'Cc')).toBeUndefined();
    const subject = Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(header(mime, 'Subject')!)![1]!, 'base64').toString('utf8');
    expect(subject).toBe('[TEST → manager@gmail.com, office@jacmar-restaurants.com] Vous avez maintenant accès à Cash Balancing');
  });

  it('in test mode, a designated tester gets it directly and a stranger is redirected, as two messages', async () => {
    const f = fake();
    const r = await createGmail(env({ testAllowlist: new Set(['tester@gmail.com']) }), f.deps).send({ ...msg, to: ['tester@gmail.com', 'stranger@gmail.com'] });
    expect(r).toEqual({ sent: true, ids: ['m1', 'm1'], redirected: true });
    expect(f.sent.map((s) => header(decode(s.raw), 'To'))).toEqual(['tester@gmail.com', 'sony@jacmar-restaurants.com']);
  });

  it('in live mode goes to the real recipient', async () => {
    const f = fake();
    await createGmail(env({ mode: 'live' }), f.deps).send(msg);
    expect(header(decode(f.sent[0]!.raw), 'To')).toBe('manager@gmail.com');
  });

  it('carries both bodies intact, accents included', async () => {
    const f = fake();
    await createGmail(env(), f.deps).send(msg);
    const parts = decode(f.sent[0]!.raw).split('--B');
    const body = (p: string) => Buffer.from(p.split('\r\n\r\n')[1]!.replace(/\r\n/g, ''), 'base64').toString('utf8');
    expect(body(parts[1]!)).toBe(msg.text);
    expect(body(parts[2]!)).toBe(msg.html);
    expect(parts[1]).toContain('text/plain; charset=UTF-8');
    expect(parts[2]).toContain('text/html; charset=UTF-8');
  });

  it('never sends to a .invalid address', async () => {
    const f = fake();
    expect(await createGmail(env(), f.deps).send({ ...msg, to: ['x@example.invalid'] })).toEqual({
      sent: false,
      reason: 'no_deliverable_recipient',
    });
    expect(f.sent).toHaveLength(0);
  });

  it('refuses a test-mode send with no test inbox, rather than sending to the real person', async () => {
    const f = fake();
    const r = await createGmail(env({ testInbox: undefined }), f.deps).send(msg);
    expect(r.sent).toBe(false);
    expect(f.sent).toHaveLength(0);
  });

  it('refuses a subject with a line break (header injection), and never throws', async () => {
    const f = fake();
    const r = await createGmail(env(), f.deps).send({ ...msg, subject: 'Hi\r\nBcc: everyone@x.com' });
    expect(r).toEqual({ sent: false, reason: 'header contains a line break' });
    expect(f.sent).toHaveLength(0);
  });

  it('reports a failure instead of throwing', async () => {
    const noToken = fake({ token: () => new Response(JSON.stringify({ error: 'unauthorized_client' }), { status: 401 }) });
    expect(await createGmail(env(), noToken.deps).send(msg)).toEqual({ sent: false, reason: 'token_unauthorized_client' });
    const refused = fake({ send: () => new Response('{}', { status: 403 }) });
    expect(await createGmail(env(), refused.deps).send(msg)).toEqual({ sent: false, reason: 'send_http_403' });
  });

  it('reuses its token for 55 minutes', async () => {
    const f = fake();
    const g = createGmail(env(), f.deps);
    await g.send(msg);
    await g.send(msg);
    expect(f.tokens()).toBe(1);
    f.advance(3_400_000);
    await g.send(msg);
    expect(f.tokens()).toBe(2);
    expect(f.sent[2]!.auth).toBe('Bearer tok2');
  });
});

describe('signedAssertion', () => {
  it('is a JWT signed by the key, acting as the sender, for gmail.send only', () => {
    const jwt = signedAssertion(env(), 1000);
    const [h, c, s] = jwt.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, s!, 'base64url')).toBe(true);
    expect(JSON.parse(Buffer.from(c!, 'base64url').toString())).toEqual({
      iss: 'mailer@apps-hub.iam.gserviceaccount.com',
      sub: 'sony@jacmar-restaurants.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1000,
      exp: 4600,
    });
  });
});

describe('readGmailEnv', () => {
  const key = Buffer.from(JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: pem })).toString('base64');

  it('reads the base64 key, and anything but exactly "live" is test', () => {
    expect(readGmailEnv({ GMAIL_SERVICE_ACCOUNT: key, GMAIL_SENDER: 's@x.com', EMAIL_MODE: 'Live' }).mode).toBe('test');
    expect(readGmailEnv({ GMAIL_SERVICE_ACCOUNT: key, GMAIL_SENDER: 's@x.com', EMAIL_MODE: 'live' }).mode).toBe('live');
  });

  it('reads the designated testers from EMAIL_TEST_ALLOWLIST', () => {
    const e = readGmailEnv({ GMAIL_SERVICE_ACCOUNT: key, GMAIL_SENDER: 's@x.com', EMAIL_TEST_ALLOWLIST: 'Tester.One@gmail.com, pierrej@jacmar-restaurants.com' });
    expect(e.testAllowlist).toEqual(new Set(['testerone@gmail.com', 'pierrej@jacmar-restaurants.com']));
    expect(readGmailEnv({ GMAIL_SERVICE_ACCOUNT: key, GMAIL_SENDER: 's@x.com' }).testAllowlist.size).toBe(0);
  });

    it('names what is missing or malformed, without echoing it', () => {
    expect(() => readGmailEnv({ GMAIL_SENDER: 's@x.com' })).toThrow('GMAIL_SERVICE_ACCOUNT not set');
    expect(() => readGmailEnv({ GMAIL_SERVICE_ACCOUNT: 'bm90IGpzb24=', GMAIL_SENDER: 's' })).toThrow(/not a base64-encoded JSON key$/);
  });
});

describe('buildMime', () => {
  it('leaves an ASCII subject readable', () => {
    expect(buildMime('a@b.c', { to: ['x@y.z'], cc: [], subject: 'Hello', text: 't', html: 'h' }, 'B')).toContain('Subject: Hello\r\n');
  });
});
