import { CATALOGUE } from '../catalogue';

/**
 * The apps a person can ASK for: the catalogue's roster-governed ones (today, Cash
 * Balancing). One list, the catalogue; this only narrows it and names what the access
 * emails need. `key` is the app's key in rbac, as the old App_* tab named it (§28).
 */
export interface AppInfo {
  key: string;
  name: { fr: string; en: string };
  /** Where the app lives in this Next.js app, for the "you now have access" email. */
  path: string;
}

export const APPS: readonly AppInfo[] = CATALOGUE.filter((a) => a.governed).map((a) => ({
  key: a.key,
  name: { fr: a.nameFr, en: a.name },
  path: a.defaultUrl ?? '/',
}));

export const appByKey = (key: string) => APPS.find((a) => a.key === key);
