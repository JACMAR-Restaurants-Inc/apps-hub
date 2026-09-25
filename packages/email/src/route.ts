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
 * A redirected message keeps its original recipients in the subject, so a demo can
 * show exactly who it WOULD have reached.
 */

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

export function routeEmail(msg: OutgoingEmail, mode: EmailMode, testInbox: string | undefined): RoutedEmail {
  const cc = msg.cc ?? [];
  if (mode === 'live') return { to: msg.to, cc, subject: msg.subject, redirected: false };

  if (!testInbox) throw new Error('EMAIL_TEST_INBOX is not set; refusing to send in test mode');

  const original = [...msg.to, ...cc].join(', ');
  return {
    to: [testInbox],
    cc: [],
    subject: `[TEST → ${original}] ${msg.subject}`,
    redirected: true,
  };
}
