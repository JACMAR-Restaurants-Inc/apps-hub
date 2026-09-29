'use client';

import { AccountMenu, type BarViewer } from '@/components/top-bar';
import { InstallSheet } from '@/components/install';
import { ct, type CashKey } from '@/lib/cash/i18n';
import { t, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

/**
 * Cash Balancing's own bar, as the old app's (App.html, renderAppbar): its mark and
 * name on the left, a home button to the dashboard; its tabs; the avatar last. Owner's
 * call, 2026-09-29: "I want it to feel like its own app". It used to sit under the
 * portal's bar, two menus stacked. The way back is "Retour au portail" in the avatar
 * menu; the sign-in is the portal's either way.
 * "Nouveau décompte" only for someone who files counts: Office and Admin never do
 * (safe-count §4). The server refuses them either way.
 * The tabs go behind ≡ below 1024px (cash.css): five of them do not fit beside the name
 * and the avatar any narrower. The old app did the same below 900px.
 */
export function CashBar({ lang, viewer, canCount, isAdmin, theme }: {
  lang: Lang;
  viewer: BarViewer;
  canCount: boolean;
  isAdmin: boolean;
  theme: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs: { href: string; label: CashKey; current: boolean }[] = [
    { href: '/cash', label: 'nav_dashboard', current: path === '/cash' || path.startsWith('/cash/restaurant') },
    ...(canCount ? [{ href: '/cash/new', label: 'nav_count' as const, current: path.startsWith('/cash/new') }] : []),
    { href: '/cash/day', label: 'nav_daily', current: path.startsWith('/cash/day') || path.startsWith('/cash/count') },
    ...(isAdmin
      ? [
          { href: '/cash/reports', label: 'nav_reports' as const, current: path.startsWith('/cash/reports') },
          { href: '/cash/admin', label: 'nav_admin' as const, current: path.startsWith('/cash/admin') },
        ]
      : []),
  ];

  const goHome = () => {
    setMenuOpen(false);
    if (path === '/cash') router.refresh();
    else router.push('/cash');
  };

  return (
    <>
      <header className={`bar cb-bar${menuOpen ? ' open' : ''}`} id="bar">
        <div className="barin">
          <button type="button" className="brand" onClick={goHome} aria-label={ct(lang, 'brand_home')} title={ct(lang, 'brand_home')}>
            <span className="cb-mark" aria-hidden="true" />
            <span className="pname">{ct(lang, 'app_title')}</span>
          </button>
          <div className="sp" />
          <nav className="tnav" id="nav" aria-label="Cash Balancing">
            {tabs.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="navl"
                aria-current={l.current ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <span>{ct(lang, l.label)}</span>
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="menubtn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="nav"
            aria-label="Menu"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <AccountMenu
            lang={lang}
            viewer={viewer}
            extra={theme}
            links={
              <>
                <Link href="/" className="acctout acctitem">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 10.5L12 3l9 7.5" />
                    <path d="M5 9.5V20h14V9.5" />
                  </svg>
                  <span>{t(lang, 'backToPortal')}</span>
                </Link>
                <div className="acctdiv" />
              </>
            }
          />
        </div>
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <InstallSheet lang={lang} />
    </>
  );
}
