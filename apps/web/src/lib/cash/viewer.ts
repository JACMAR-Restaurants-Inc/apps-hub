import 'server-only';
import { can, isSystemAdmin, memberKey } from '@hub/rbac';
import { cache } from 'react';
import { listRestaurants } from '../restaurants';
import { getRoster, getSignedInEmail } from '../viewer';
import { CASH_APP } from './math';

/**
 * Who is using Cash Balancing and what the pages should show them (safe-count
 * RbacAuth.gs userFromActor_). For DRAWING only: every action still calls authorize().
 *
 * - stores: what the roster grants, open restaurants only; every open one for a
 *   system admin (the RBAC library's requireActor did the same).
 * - Three flags, not one role (safe-count §4): manager (files counts, sends to the
 *   accountant), office (the consolidated view), admin (the admin page).
 * - canCount: who files counts. Managers do; office staff never do (safe-count §4, App.html
 *   canCount). SYSTEM admins do too (owner, 2026-09-29: "admins can do whatever the
 *   managers can"); they used to be kept out like office staff. The server already let
 *   them: a system admin passes every can().
 * - canSendToAccountant: a manager's, and a system admin's since the same day.
 */
export interface CashViewer {
  email: string;
  name: string;
  stores: { id: string; name: string }[];
  isManager: boolean;
  isOffice: boolean;
  isAdmin: boolean;
  canCount: boolean;
  canSendToAccountant: boolean;
}

/** Who may file counts and send to the accountant, from who they are. Pure, so tested. */
export function cashAbilities(p: { systemAdmin: boolean; office: boolean; adminPanel: boolean; role: string | null | undefined; stores: number }) {
  return {
    canCount: p.stores > 0 && (p.systemAdmin || !(p.office || p.adminPanel)),
    canSendToAccountant: p.systemAdmin || p.role === 'manager',
  };
}

export const getCashViewer = cache(async (): Promise<CashViewer | null> => {
  const who = await getSignedInEmail();
  if (!who) return null;
  const [roster, all] = await Promise.all([getRoster(), listRestaurants()]);
  if (!can(roster, who.email, CASH_APP, 'app', 'access')) return null;

  const admin = isSystemAdmin(roster, who.email);
  const member = roster.members.get(memberKey(CASH_APP, who.email));
  const stores = all
    .filter((r) => r.active && (admin || member?.stores.has(r.id)))
    .map((r) => ({ id: r.id, name: r.name }));
  const isOffice = can(roster, who.email, CASH_APP, 'dashboard_consolidated', 'view');
  const isAdmin = can(roster, who.email, CASH_APP, 'admin_panel', 'access');
  return {
    email: who.email,
    // Google's name, as the old app used the roster's: it is what goes on the count.
    name: who.name || who.email,
    stores,
    isManager: member?.role === 'manager',
    isOffice,
    isAdmin,
    ...cashAbilities({ systemAdmin: admin, office: isOffice, adminPanel: isAdmin, role: member?.role, stores: stores.length }),
  };
});
