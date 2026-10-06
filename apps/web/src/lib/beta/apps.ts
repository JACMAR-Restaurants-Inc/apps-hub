import { catalogueApp } from '../catalogue';

/**
 * Beta apps (owner, 2026-09-30): new versions of our apps, or brand-new apps, tried by a
 * few chosen people before they go live. Kept OUT of the catalogue on purpose, so no list built from it
 * (Home, Applications, favourites, Request access) can ever show one: a beta is reached
 * only from the Tests page, by its testers and the system admins.
 *
 * `base` is the live app it is a new version of, or null for a brand-new app. Either
 * way a tester tests with their own role and restaurants, the same in every app (owner,
 * 2026-10-06; a Gérant at Hull tests as a Gérant at Hull): testing is a permission on
 * top of their access, never a second grant to keep in step. With a base, they must
 * hold that app; with none, any app (lib/beta/rules.ts).
 *
 * Each beta has its own schema, as Cash Balancing does (CLAUDE.md §3, separable). Going
 * live: remove it from this list, clear its schema with a deliberate script (never a
 * button), and delete its rbac.beta_testers rows; the emptied schema is the live one.
 */
export interface BetaApp {
  key: string;
  /** The live app this is a new version of; null for a brand-new app. */
  base: string | null;
  name: string;
  nameFr: string;
  blurb: string;
  blurbFr: string;
  /**
   * Where Open goes: a path in this Next.js app, or the https:// address of a test
   * console that stays in Apps Script (owner, 2026-10-06: automations are easier kept
   * there until they move here), opened in a new tab. For a console the portal decides
   * only who SEES the card: the console is public to anyone with its address, as it was
   * before (owner's choice: a plain link, not a signed ticket the console would check).
   */
  path: string;
  mark: string;
  tint: string;
}

// None yet: the owner's version 2 goes here when it reaches beta. The placeholder
// (BetaDemo, /beta/demo) was removed on 2026-09-30 once the owner had tried Tests.
// The tests use their own beta (vi.mock of this module).
export const BETA_APPS: readonly BetaApp[] = [];

export const betaApp = (key: string) => BETA_APPS.find((a) => a.key === key);

/** A test console outside the portal (Apps Script), not a beta built here. */
export const isConsole = (b: BetaApp) => b.path.startsWith('https://');

/** The live app's name, for "tests with their Cash Balancing access". Null for a brand-new app. */
export const baseName = (b: BetaApp, lang: 'fr' | 'en') => {
  if (!b.base) return null;
  const a = catalogueApp(b.base);
  return a ? (lang === 'fr' ? a.nameFr : a.name) : b.base;
};
