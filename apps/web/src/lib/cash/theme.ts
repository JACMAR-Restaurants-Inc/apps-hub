import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cash Balancing's own theme (safe-count Styles.html): dark by default, light on a
 * device set to light, and a choice made in the avatar menu beats the device either
 * way. The choice is a cookie rather than localStorage (the old sc_theme) so the
 * server draws the page in it and nothing flashes. The portal keeps its own look.
 */
export const CASH_THEME_COOKIE = 'cb_theme';
export type CashTheme = 'light' | 'dark';

export async function getCashTheme(): Promise<CashTheme | null> {
  const v = (await cookies()).get(CASH_THEME_COOKIE)?.value;
  return v === 'light' || v === 'dark' ? v : null;
}
