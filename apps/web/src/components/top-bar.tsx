'use client';

import { setLanguage } from '@/app/actions';
import { authClient } from '@/lib/auth-client';
import { t, type Key, type Lang } from '@/lib/i18n';
import { InstallMenuItem, InstallSheet } from './install';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { roleLabel } from '@/lib/labels';

export interface BarViewer {
  email: string;
  initials: string;
  /** 'admin' | 'office' | 'manager' | 'viewer' | null: the label beside the initials. */
  role: 'admin' | 'office' | 'manager' | 'viewer' | null;
  isAdmin: boolean;
  /** The badge: for an admin the office's queue (Répertoire), for anyone else their
   *  unread notifications (Notifications; it was their pending requests, on Demandes).
   *  Hidden at 0. */
  waiting: number;
  /** Shows Tests: a system admin while any beta exists, anyone else while they test one they can open. */
  testing: boolean;
}

/**
 * The top bar, the Apps Script portal's markup (Ui.html, "the bar"; §44/§56/§59).
 * - The mark goes home, and refreshes the page's data (§56), for everybody.
 * - Everybody has the menu (owner's redesign, 2026-09-26), inline from 761px and behind
 *   ≡ below it: Accueil · Applications · a bell (Notifications; owner, 2026-09-29: an
 *   icon rather than the word, which the phone menu still shows), and for an admin Accueil ·
 *   Applications · Répertoire des accès · Administration. Tests comes after
 *   Applications, only for a beta's testers and the admins (owner, 2026-09-30). It used to be admins only,
 *   "a menu with one entry is not a menu"; a manager now has three.
 * - The account card: the address signed in with (the answer to "am I on the right
 *   account?"), the language, "Ajouter à l'écran d'accueil" on a phone (install.tsx),
 *   and sign out, which does NOT sign anyone out of Google.
 */
export function TopBar({ lang, viewer }: { lang: Lang; viewer: BarViewer }) {
  const router = useRouter();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const at = (p: string) => path === p || path.startsWith(p + '/');
  const links: { href: string; label: Key; current: boolean; count: number; bell?: boolean }[] = [
    { href: '/', label: 'navHome', current: path === '/', count: 0 },
    { href: '/apps', label: 'navApps', current: at('/apps'), count: 0 },
    ...(viewer.testing ? [{ href: '/tests', label: 'navTests' as const, current: at('/tests') || at('/beta'), count: 0 }] : []),
    ...(viewer.isAdmin
      ? [
          { href: '/admin/access', label: 'navDirectory' as const, current: at('/admin/access'), count: viewer.waiting },
          { href: '/admin/settings', label: 'navSettings' as const, current: at('/admin/settings') || at('/admin/audit'), count: 0 },
        ]
      : [{ href: '/notifications', label: 'navNotifications' as const, current: at('/notifications'), count: viewer.waiting, bell: true }]),
  ];

  const goHome = () => {
    setMenuOpen(false);
    if (path === '/') router.refresh();
    else router.push('/');
  };

  return (
    <>
      <header className={`bar${menuOpen ? ' open' : ''}`} id="bar">
        <div className="barin">
          <button type="button" className="brand" onClick={goHome}>
            <span className="pmark" aria-hidden="true" />
            <span className="pname">
              <b>JM</b> Portal
            </span>
          </button>
          <div className="sp" />
          <nav className="tnav" id="nav" aria-label="Portail / Portal">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={l.bell ? 'navl navbell' : 'navl'}
                aria-current={l.current ? 'page' : undefined}
                // The bell alone in the bar: its name is said, and shown in the phone menu.
                aria-label={l.bell ? `${t(lang, l.label)}${l.count > 0 ? ` (${l.count})` : ''}` : undefined}
                title={l.bell ? t(lang, l.label) : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {l.bell && (
                  <svg className="bell" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8" />
                    <path d="M10.3 21a1.94 1.94 0 003.4 0" />
                  </svg>
                )}
                <span className={l.bell ? 'navword' : undefined}>{t(lang, l.label)}</span>
                {l.count > 0 && <span className="count">{l.count}</span>}
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
          <AccountMenu lang={lang} viewer={viewer} />
        </div>
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <InstallSheet lang={lang} />
    </>
  );
}

/**
 * The avatar and its account card, shared by the portal's bar and each app's own bar.
 * `links`: items an app puts first, above the language, each ending in its own
 * divider (Cash Balancing's "Retour au portail", owner's order, 2026-09-29).
 * `extra`: rows an app adds under the language (Cash Balancing's theme).
 */
export function AccountMenu({ lang, viewer, extra, links }: { lang: Lang; viewer: BarViewer; extra?: ReactNode; links?: ReactNode }) {
  const router = useRouter();
  const [acctOpen, setAcctOpen] = useState(false);
  const [pending, start] = useTransition();
  const acctRef = useRef<HTMLDivElement>(null);

  // Close the account card on a click outside it, or on Escape.
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAcctOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [acctOpen]);

  return (
    <div className="acct" ref={acctRef}>
      <button
        type="button"
        className="acctbtn"
        onClick={() => setAcctOpen((o) => !o)}
        aria-expanded={acctOpen}
        aria-controls="acctcard"
        aria-label="Compte / Account"
      >
        <span className="av">{viewer.initials}</span>
        {viewer.role && <span className="role">{roleLabel(lang, viewer.role)}</span>}
        <svg className="car" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {acctOpen && (
        <div className="acctcard" id="acctcard">
          <p className="addr">{viewer.email}</p>
          <p className="lbl">{t(lang, 'signedInWithGoogle')}</p>
          <div className="acctdiv" />
          {links}
          <div className="optrow">
            <span>{t(lang, 'language')}</span>
            <div className="optseg" role="group" aria-label="Langue / Language">
              {(['fr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={l === lang ? 'on' : undefined}
                  aria-pressed={l === lang}
                  disabled={pending}
                  onClick={() => start(() => setLanguage(l))}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {extra}
          <div className="acctdiv" />
          <InstallMenuItem lang={lang} onPick={() => setAcctOpen(false)} />
          {/* Signs out of this portal only. Signing them out of Google would take
              them out of Gmail on their own phone. */}
          <button
            type="button"
            className="acctout"
            style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={async () => {
              await authClient.signOut();
              router.push('/');
              router.refresh();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 17l5-5-5-5" />
              <path d="M20 12H9" />
              <path d="M12 20H6a2 2 0 01-2-2V6a2 2 0 012-2h6" />
            </svg>
            <span>{t(lang, 'signOut')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The footer, as the old portal's. */
export function Footer({ lang }: { lang: Lang }) {
  return (
    <footer>
      <div className="inner">
        Jacmar Restaurants Inc. &middot; <span>{t(lang, 'footerAccess')}</span>
      </div>
    </footer>
  );
}
