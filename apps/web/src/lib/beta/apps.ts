import { catalogueApp } from '../catalogue';

/**
 * Beta apps (owner, 2026-09-30): new versions of our apps, tried by a few chosen people
 * before they go live. Kept OUT of the catalogue on purpose, so no list built from it
 * (Home, Applications, favourites, Request access) can ever show one: a beta is reached
 * only from the Tests page, by its testers and the system admins.
 *
 * `base` is the live app it is a new version of. A tester keeps the role and
 * restaurants they hold THERE (a Gérant at Hull tests as a Gérant at Hull): testing is
 * a permission on top of their access, never a second grant to keep in step.
 *
 * Each beta has its own schema, as Cash Balancing does (CLAUDE.md §3, separable). Going
 * live: remove it from this list, clear its schema with a deliberate script (never a
 * button), and delete its rbac.beta_testers rows; the emptied schema is the live one.
 */
export interface BetaApp {
  key: string;
  base: string;
  name: string;
  nameFr: string;
  blurb: string;
  blurbFr: string;
  /** Where it lives in this Next.js app. */
  path: string;
  mark: string;
  tint: string;
}

export const BETA_APPS: readonly BetaApp[] = [
  {
    // A placeholder, until the first real beta (the owner's version 2) moves in. It
    // only shows a tester what the beta sees of them; delete it then.
    key: 'BetaDemo',
    base: 'SafeCount',
    name: 'Beta demo',
    nameFr: 'Démo bêta',
    blurb: 'A test page: shows the role and restaurants you test with.',
    blurbFr: 'Une page d’essai : montre le rôle et les restaurants avec lesquels vous testez.',
    path: '/beta/demo',
    mark: 'β',
    tint: '#0369A1',
  },
];

export const betaApp = (key: string) => BETA_APPS.find((a) => a.key === key);

/** The live app's name, for "tests with their Cash Balancing access". */
export const baseName = (b: BetaApp, lang: 'fr' | 'en') => {
  const a = catalogueApp(b.base);
  return a ? (lang === 'fr' ? a.nameFr : a.name) : b.base;
};
