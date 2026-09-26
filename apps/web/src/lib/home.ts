/**
 * What the home page shows a person: which cards, in what state and order, their
 * greeting and their summary figures. Pure: the page loads the facts, this decides.
 * Ported from the Apps Script portal (Portal.gs homeSections_, prettyFirstName_,
 * greetingPart_; Home.html); the § numbers are RBAC/CLAUDE.md's.
 */

import { APP_GROUPS, CATALOGUE, CATEGORIES, appUrl, inkFor, openStyle, type CatalogueApp, type CategoryKey, type Group } from './catalogue';

export type CardState = 'held' | 'pending' | 'revoked' | 'askable';

export interface HomeCard {
  key: string;
  name: string;
  nameFr: string;
  blurb: string;
  blurbFr: string;
  category: CategoryKey;
  group: Group;
  adminOnly: boolean;
  governed: boolean;
  logo: CatalogueApp['logo'] | null;
  mark: string;
  tint: string | null;
  ink: string | null;
  url: string | null;
  label: 'open' | 'openApp';
  newTab: boolean;
  state: CardState;
  /** For a pending request: when they asked. */
  askedAt: string | null;
  /** Lowercase, accent-free text the search matches: names, blurbs, category, both languages (§47). */
  hay: string;
}

export interface HomeSection {
  kind: Group;
  name: string;
  nameFr: string;
  cards: HomeCard[];
  /** Somebody can ask for something here: the section's line says the office is told. */
  canAsk: boolean;
}

/** Strip accents and case, so "developpement" finds "Développement". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The first word of a name, in a case you can say hello with (§54, prettyFirstName_). */
export function prettyFirstName(fullName: string | null | undefined): string {
  const first = String(fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first) return '';
  // All capitals: take it down and rebuild. Anything with lower case was typed by
  // somebody, so only first letters are raised: McDonald and DeSouza stay as written.
  const base = /[a-z]/.test(first) ? first : first.toLowerCase();
  return base.replace(/(^|[-'’])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Morning, afternoon or evening, from an hour 0-23 (§54, greetingPart_). */
export const greetingPart = (hour: number) => (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');

/** The hour in Toronto, where the restaurants are, for the server's first paint. */
export function torontoHour(at: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23' }).format(at));
}

export interface Membership {
  app: string;
  status: 'pending' | 'active' | 'revoked';
  since: Date;
}

/**
 * The sections, cards and order for one person (§45/§51/§82):
 * - An admin sees every card and holds every app (can() step 1), so never Request access.
 * - Everybody else: admin-only cards are not drawn; open-to-all cards are held; a
 *   governed card is held only with an active row AND the person switched on.
 * - Inside each group: held, then pending, then askable, alphabetical by French name.
 */
export function homeSections(input: {
  isAdmin: boolean;
  personActive: boolean;
  memberships: Membership[];
  formatDay: (d: Date) => string;
  env?: Record<string, string | undefined>;
}): HomeSection[] {
  const byApp = new Map(input.memberships.map((m) => [m.app, m]));
  const cat = new Map(CATEGORIES.map((c) => [c.key, c]));
  const rank: Record<CardState, number> = { held: 0, pending: 1, revoked: 2, askable: 2 };

  const cards: HomeCard[] = CATALOGUE.filter((a) => input.isAdmin || !a.adminOnly).map((a) => {
    const m = byApp.get(a.key);
    let state: CardState;
    if (input.isAdmin || a.openToAll || a.adminOnly) state = 'held';
    else if (m?.status === 'active' && input.personActive) state = 'held';
    else if (m?.status === 'pending') state = 'pending';
    else if (m?.status === 'revoked') state = 'revoked';
    else state = 'askable';
    const c = cat.get(a.category)!;
    const { label, newTab } = openStyle(a);
    return {
      key: a.key,
      name: a.name,
      nameFr: a.nameFr,
      blurb: a.blurb,
      blurbFr: a.blurbFr,
      category: a.category,
      group: a.group,
      adminOnly: Boolean(a.adminOnly),
      governed: Boolean(a.governed),
      logo: a.logo ?? null,
      mark: a.mark,
      tint: a.logo ? null : (a.tint ?? null),
      ink: a.logo || !a.tint ? null : inkFor(a.tint),
      url: appUrl(a, input.env),
      label,
      newTab,
      state,
      askedAt: state === 'pending' && m ? input.formatDay(m.since) : null,
      hay: fold([a.name, a.nameFr, a.blurb, a.blurbFr, c.name, c.nameFr].join(' ')),
    };
  });

  return APP_GROUPS.map((g) => {
    const list = cards
      .filter((c) => c.group === g.key)
      .sort((x, y) => rank[x.state] - rank[y.state] || x.nameFr.localeCompare(y.nameFr, 'fr'));
    return { kind: g.key, name: g.name, nameFr: g.nameFr, cards: list, canAsk: list.some((c) => c.state === 'askable' || c.state === 'revoked') };
  }).filter((s) => s.cards.length > 0);
}

/**
 * Holds nothing the roster governs, and is not an admin (§66/§72): the welcome banner
 * instead of the summary cards. Open-to-all cards do not count, or the banner would
 * leave exactly the person it is for, whose likeliest problem is the wrong account.
 */
export const holdsNothing = (isAdmin: boolean, sections: HomeSection[]) =>
  !isAdmin && !sections.some((s) => s.cards.some((c) => c.governed && c.state === 'held'));

/** The categories on this page, in CATEGORIES order, each with its count (§61). */
export function pageCategories(sections: HomeSection[]) {
  const counts = new Map<CategoryKey, number>();
  for (const s of sections) for (const c of s.cards) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({ ...c, count: counts.get(c.key)! }));
}

/** Initials for the account button: first letters of the first two words, else the address's first letter. */
export function initials(name: string | null | undefined, email: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return letters || email.charAt(0).toUpperCase();
}
