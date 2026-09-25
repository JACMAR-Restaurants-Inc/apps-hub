/**
 * Where an outgoing email actually goes.
 *
 * Until leadership approves the switch, the data is REAL (imported as-is from the
 * production spreadsheets) but nobody real may be emailed. So the redirect happens
 * here, at the moment of sending, and never by rewriting addresses in the data:
 *
 *   - the roster email is how a person's Google sign-in is recognised; overwriting it
 *     would lock every tester out;
 *   - approval day then means flipping EMAIL_MODE, not editing a single row.
 *
 * In test mode, the designated testers and admins on the ALLOWLIST get their email
 * directly, as they would in live mode (owner's call, 2026-09-25: "I don't want to be
 * receiving everything, I have designated testers"). Everybody else is redirected to
 * the test inbox, with their address in the subject, so a real manager who wanders into
 * staging is never emailed, and a demo can still show who it WOULD have reached.
 * An empty allowlist is the old behaviour: everything to the test inbox.
 */

import { normalizeEmail } from '@hub/core';

export type EmailMode = 'test' | 'live';

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  subject: string;
}

export interface RoutedEmail {
  to: string[];
  cc: string[];
  subject: string;
  redirected: boolean;
}

/**
 * Reads the mode from the environment. Anything other than exactly 'live' is test:
 * a missing or misspelled setting must never email real people.
 */
export function emailModeFrom(value: string | undefined): EmailMode {
  return value === 'live' ? 'live' : 'test';
}

/** EMAIL_TEST_ALLOWLIST: addresses separated by commas, spaces or new lines. Normalised. */
export function allowlistFrom(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(/[\s,;]+/)
      .map((e) => normalizeEmail(e))
      .filter((e) => e.includes('@')),
  );
}

/**
 * The messages to actually send: none, one or two. In test mode an email to a tester
 * and a stranger becomes one to the tester as written, and one to the test inbox
 * naming the stranger. A cc never reaches anyone not on the list.
 */
export function routeEmail(
  msg: OutgoingEmail,
  mode: EmailMode,
  testInbox: string | undefined,
  allowlist: ReadonlySet<string> = new Set(),
): RoutedEmail[] {
  const cc = msg.cc ?? [];
  if (mode === 'live') return [{ to: msg.to, cc, subject: msg.subject, redirected: false }];

  const ok = (e: string) => allowlist.has(normalizeEmail(e));
  const allowedTo = msg.to.filter(ok);
  const allowedCc = cc.filter(ok);
  const others = [...msg.to, ...cc].filter((e) => !ok(e));

  const out: RoutedEmail[] = [];
  if (allowedTo.length || allowedCc.length) {
    out.push({
      to: allowedTo.length ? allowedTo : allowedCc,
      cc: allowedTo.length ? allowedCc : [],
      subject: msg.subject,
      redirected: false,
    });
  }
  if (others.length) {
    if (!testInbox) throw new Error('EMAIL_TEST_INBOX is not set; refusing to send in test mode');
    out.push({ to: [testInbox], cc: [], subject: `[TEST → ${others.join(', ')}] ${msg.subject}`, redirected: true });
  }
  return out;
}
