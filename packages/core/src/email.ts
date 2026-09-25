/**
 * The sign-in email is the join key for everything (RBAC CLAUDE.md §4), so it is
 * normalised identically on every read and every write.
 *
 * Dots are stripped ONLY for Gmail. Gmail ignores them, so jane.doe@gmail.com and
 * janedoe@gmail.com are one account. Yahoo, Hotmail and Outlook treat dots as
 * significant: stripping them there would merge two different people.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return email;
  // googlemail.com is the same mailbox as gmail.com.
  return `${local.replace(/\./g, '')}@gmail.com`;
}
