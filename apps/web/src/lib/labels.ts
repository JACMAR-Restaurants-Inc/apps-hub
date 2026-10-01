import { t, type Lang } from './i18n';

/**
 * How the portal names a role and a restaurant, in ONE place (CLAUDE.md §7, item 4,
 * 2026-09-30: the role names were mapped in 3 files and the restaurant label built in 7).
 * Pure, and safe in client components.
 *
 * Cash Balancing names a restaurant by its name alone, as the old app did: that is its
 * own look (its own bar and theme), not a drift, and it does not use these.
 */

export const ROLE_KEYS = { admin: 'roleAdmin', office: 'role_office', manager: 'role_manager', viewer: 'role_viewer' } as const;

/** "Gérant", "Bureau", "Consultation" (or "Admin"); an unknown role as stored; nothing as ''. */
export function roleLabel(lang: Lang, role: string | null | undefined): string {
  if (!role) return '';
  // Own keys only: 'constructor' or 'toString' must not read as a role.
  return Object.hasOwn(ROLE_KEYS, role) ? t(lang, ROLE_KEYS[role as keyof typeof ROLE_KEYS]) : role;
}

/** "1647 - Hull", the Apps Script portal's way (lib/i18n.ts); the number alone when the name is unknown. */
export function restaurantLabel(id: string, name?: string | null): string {
  return name ? `${id} - ${name}` : id;
}
