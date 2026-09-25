/**
 * The apps the portal lists. `key` is the app's key in rbac (the old App_* tab's
 * suffix, kept as it was: RBAC §28, the incumbent wins).
 *
 * Every app is shown to everyone, and each card says where the person stands (RBAC §45).
 */

export interface AppInfo {
  key: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  /** Where the app lives in this Next.js app. */
  path: string;
}

export const APPS: readonly AppInfo[] = [
  {
    key: 'SafeCount',
    name: { fr: 'Cash Balancing', en: 'Cash Balancing' },
    description: {
      fr: 'Décompte du coffre, des caisses et de la petite caisse.',
      en: 'Safe, till and petty cash counts.',
    },
    path: '/cash',
  },
];

export const appByKey = (key: string) => APPS.find((a) => a.key === key);
