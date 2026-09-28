'use client';

import { ct, type CashKey } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Cash Balancing's own tabs, under the portal's bar (App.html's rail, as tabs).
 * "Nouveau décompte" only for someone who files counts: Office and Admin never do
 * (safe-count §4). The server refuses them either way.
 */
export function CashNav({ lang, canCount, isAdmin }: { lang: Lang; canCount: boolean; isAdmin: boolean }) {
  const path = usePathname();
  const tabs: { href: string; label: CashKey; current: boolean }[] = [
    { href: '/cash', label: 'nav_dashboard', current: path === '/cash' || path.startsWith('/cash/restaurant') },
    ...(canCount ? [{ href: '/cash/new', label: 'nav_count' as const, current: path.startsWith('/cash/new') }] : []),
    { href: '/cash/day', label: 'nav_daily', current: path.startsWith('/cash/day') || path.startsWith('/cash/count') },
    ...(isAdmin ? [{ href: '/cash/admin', label: 'nav_admin' as const, current: path.startsWith('/cash/admin') }] : []),
  ];
  return (
    <nav className="cb-tabs" aria-label="Cash Balancing">
      <span className="cb-mark" role="img" aria-label="Cash Balancing" />
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.current ? 'page' : undefined}>
          {ct(lang, t.label)}
        </Link>
      ))}
    </nav>
  );
}
