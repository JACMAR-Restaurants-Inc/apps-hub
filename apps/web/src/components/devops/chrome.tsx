'use client';

import { setDevopsThemeAction } from '@/app/devops/actions';
import { AccountMenu, type BarViewer } from '@/components/top-bar';
import { InstallSheet } from '@/components/install';
import { dt } from '@/lib/devops/i18n';
import { projectHue } from '@/lib/devops/rules';
import { t, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';

export interface SideProject {
  id: number;
  name: string;
}

/**
 * JM DevOps' frame, the old app's (App.tsx, Topbar.tsx, Sidebar.tsx): a white bar with
 * the ring and the name, the navy sidebar of projects, the page. Below 860px the sidebar
 * is a drawer behind ≡. Its own app (owner, 2026-09-29), like Cash Balancing: the
 * way back to the portal is in the avatar menu, first.
 */
export function DevopsChrome({
  lang,
  viewer,
  projects,
  theme,
  children,
}: {
  lang: Lang;
  viewer: BarViewer;
  projects: SideProject[];
  theme: 'light' | 'dark' | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const goHome = () => {
    setOpen(false);
    if (path === '/devops') router.refresh();
    else router.push('/devops');
  };
  const current = (id: number) => path === `/devops/${id}` || path.startsWith(`/devops/${id}/`);

  return (
    <>
      <header className={`bar dv-bar${open ? ' open' : ''}`} id="bar">
        <div className="barin">
          <button type="button" className="menubtn dv-menubtn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="dv-side" aria-label="Menu">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <button type="button" className="brand" onClick={goHome} aria-label={dt(lang, 'brand_home')} title={dt(lang, 'brand_home')}>
            <span className="dv-mark" aria-hidden="true" />
            <span className="pname">{dt(lang, 'app_title')}</span>
          </button>
          <div className="sp" />
          <AccountMenu
            lang={lang}
            viewer={viewer}
            extra={<ThemeSwitch lang={lang} chosen={theme} />}
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
      <div className="dv-shell">
        <nav className={`dv-side${open ? ' open' : ''}`} id="dv-side" aria-label={dt(lang, 'nav_projects_menu')}>
          <Link href="/devops" className="dv-sidel" aria-current={path === '/devops' ? 'page' : undefined} onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
            <span>{dt(lang, 'nav_overview')}</span>
          </Link>
          <p className="dv-sidehead">{dt(lang, 'nav_projects')}</p>
          {projects.map((p) => (
            <Link key={p.id} href={`/devops/${p.id}`} className="dv-sidel" aria-current={current(p.id) ? 'page' : undefined} onClick={() => setOpen(false)}>
              <span className="dv-dot" style={{ background: `hsl(${projectHue(p.id)} 64% 52%)` }} aria-hidden="true" />
              <span className="dv-sidename">{p.name}</span>
            </Link>
          ))}
        </nav>
        {open && <div className="dv-scrim" onClick={() => setOpen(false)} />}
        <div className="dv-main">{children}</div>
      </div>
      <InstallSheet lang={lang} />
    </>
  );
}

const query = '(prefers-color-scheme: dark)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** Thème: Clair / Sombre, as Cash Balancing's. With nothing chosen, what the device gives. */
function ThemeSwitch({ lang, chosen }: { lang: Lang; chosen: 'light' | 'dark' | null }) {
  const deviceDark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const current = chosen ?? (deviceDark ? 'dark' : 'light');
  const [pending, start] = useTransition();
  const pick = (v: 'light' | 'dark') => {
    // Repaint now: the colours are variables, so nothing typed is lost.
    document.querySelector('.dv-app')?.setAttribute('data-theme', v);
    start(() => setDevopsThemeAction(v));
  };
  return (
    <div className="optrow">
      <span>{dt(lang, 'theme_label')}</span>
      <div className="optseg" role="group" aria-label={dt(lang, 'theme_label')}>
        {(['light', 'dark'] as const).map((v) => (
          <button key={v} type="button" className={v === current ? 'on' : undefined} aria-pressed={v === current} disabled={pending} onClick={() => pick(v)}>
            {dt(lang, v === 'light' ? 'theme_light' : 'theme_dark')}
          </button>
        ))}
      </div>
    </div>
  );
}
