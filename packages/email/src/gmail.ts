/**
 * Sending through Gmail, as a Workspace mailbox, with a service account that has
 * domain-wide delegation for ONE scope: gmail.send. It can send; it cannot read.
 *
 * No Google SDK: a signed JWT, one token exchange, one POST. Every message goes
 * through routeEmail() first, so the test/live decision is made at the moment of
 * sending, here, and nowhere else (CLAUDE.md §4).
 *
 * send() never throws. Its callers have already done the thing that matters (a request
 * saved, access granted); a mail failure must not be reported as that failing
 * (RBAC Request.gs). It returns what happened, for the audit.
 */

import { createSign } from 'node:crypto';
import { allowlistFrom, emailModeFrom, routeEmail, type EmailMode } from './route';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export interface Message {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
}

export type SendResult =
  /** redirected: some or all of it went to the test inbox instead of its recipients. */
  | { sent: true; ids: string[]; redirected: boolean }
  | { sent: false; reason: string };

export interface GmailEnv {
  clientEmail: string;
  privateKey: string;
  sender: string;
  mode: EmailMode;
  testInbox: string | undefined;
  /** In test mode, who gets their email directly. See route.ts. */
  testAllowlist: ReadonlySet<string>;
}

/** GMAIL_SERVICE_ACCOUNT is the service account's JSON key file, base64-encoded onto one line. */
export function readGmailEnv(env: Record<string, string | undefined> = process.env): GmailEnv {
  const missing = ['GMAIL_SERVICE_ACCOUNT', 'GMAIL_SENDER'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Email is not configured: ${missing.join(', ')} not set`);
  let key: { client_email?: unknown; private_key?: unknown };
  try {
    key = JSON.parse(Buffer.from(env.GMAIL_SERVICE_ACCOUNT!, 'base64').toString('utf8'));
  } catch {
    throw new Error('GMAIL_SERVICE_ACCOUNT is not a base64-encoded JSON key');
  }
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error('GMAIL_SERVICE_ACCOUNT has no client_email / private_key');
  }
  return {
    clientEmail: key.client_email,
    privateKey: key.private_key,
    sender: env.GMAIL_SENDER!,
    mode: emailModeFrom(env.EMAIL_MODE),
    testInbox: env.EMAIL_TEST_INBOX,
    testAllowlist: allowlistFrom(env.EMAIL_TEST_ALLOWLIST),
  };
}

/** RFC 2606: .invalid can never be delivered. Tests use it; it must not bounce. */
export function isUndeliverable(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith('.invalid') || e.endsWith('@invalid');
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');
/** No CR or LF may reach a header: that is how a header is injected. */
const safeHeader = (s: string) => {
  if (/[\r\n]/.test(s)) throw new Error('header contains a line break');
  return s;
};
const encodedWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');

/** The RFC 2822 message, UTF-8, plain text and HTML alternatives, bodies base64. Pure. */
export function buildMime(from: string, msg: { to: string[]; cc: string[]; subject: string; text: string; html: string }, boundary: string): string {
  const headers = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(msg.to.join(', '))}`,
    ...(msg.cc.length ? [`Cc: ${safeHeader(msg.cc.join(', '))}`] : []),
    `Subject: ${encodedWord(safeHeader(msg.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body))].join('\r\n');
  return [...headers, '', part('text/plain', msg.text), part('text/html', msg.html), `--${boundary}--`, ''].join('\r\n');
}

/** The signed assertion Google exchanges for a token that acts as `sender`. Pure but for the key. */
export function signedAssertion(env: Pick<GmailEnv, 'clientEmail' | 'privateKey' | 'sender'>, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: env.clientEmail, sub: env.sender, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(env.privateKey, 'base64url');
  return `${header}.${claims}.${signature}`;
}

export interface GmailDeps {
  fetch: typeof fetch;
  now: () => number;
  boundary: () => string;
}

const defaultDeps: GmailDeps = {
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  boundary: () => `hub-${crypto.randomUUID()}`,
};

export function createGmail(env: GmailEnv, deps: GmailDeps = defaultDeps) {
  let token: { value: string; until: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.until > deps.now()) return token.value;
    const res = await deps.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedAssertion(env, Math.floor(deps.now() / 1000)),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !json.access_token) throw new Error(`token_${json.error ?? res.status}`);
    token = { value: json.access_token, until: deps.now() + 3_300_000 };
    return token.value;
  }

  return {
    async send(msg: Message): Promise<SendResult> {
      try {
        const to = msg.to.filter((a) => a.trim() && !isUndeliverable(a));
        if (!to.length) return { sent: false, reason: 'no_deliverable_recipient' };
        const routed = routeEmail({ to, cc: msg.cc ?? [], subject: msg.subject }, env.mode, env.testInbox, env.testAllowlist);
        const ids: string[] = [];
        for (const r of routed) {
          const raw = buildMime(env.sender, { ...r, text: msg.text, html: msg.html }, deps.boundary());
          const res = await deps.fetch(SEND_URL, {
            method: 'POST',
            headers: { authorization: `Bearer ${await getToken()}`, 'content-type': 'application/json' },
            body: JSON.stringify({ raw: b64url(raw) }),
          });
          const json = (await res.json().catch(() => ({}))) as { id?: string };
          if (!res.ok || !json.id) return { sent: false, reason: `send_http_${res.status}` };
          ids.push(json.id);
        }
        return { sent: true, ids, redirected: routed.some((r) => r.redirected) };
      } catch (e) {
        return { sent: false, reason: e instanceof Error ? e.message : 'error' };
      }
    },
  };
}

export type Gmail = ReturnType<typeof createGmail>;
