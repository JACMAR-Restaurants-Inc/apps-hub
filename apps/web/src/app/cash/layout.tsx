import { CashNav } from '@/components/cash/cash-nav';
import { ThemeSwitch } from '@/components/cash/theme-switch';
import { Footer, TopBar } from '@/components/top-bar';
import { getCashViewer } from '@/lib/cash/viewer';
import { ct } from '@/lib/cash/i18n';
import { getCashTheme } from '@/lib/cash/theme';
import { loadBar } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import './cash.css';

/**
 * Cash Balancing inside the portal: the portal's bar, then the app's own tabs, in the
 * app's OWN theme (safe-count Styles.html: charcoal and gold, or the pale green light
 * one), not the portal's. Owner's call, 2026-09-28: "i dont like it having the same
 * theme as the portal". The layout and words are the old app's.
 * Drawing only: each page and action authorises for itself.
 */
export default async function CashLayout({ children }: LayoutProps<'/cash'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const [bar, cash, theme] = await Promise.all([loadBar(viewer), getCashViewer(), getCashTheme()]);

  return (
    <div className="cb-app" data-theme={theme ?? undefined}>
      <TopBar lang={lang} viewer={bar} extra={<ThemeSwitch lang={lang} chosen={theme} />} />
      {cash ? (
        <>
          <CashNav lang={lang} canCount={cash.canCount} isAdmin={cash.isAdmin} />
          {children}
        </>
      ) : (
        <main id="main" className="page" lang={lang}>
          <div className="banner" role="note">
            <div>
              <h2>Cash Balancing</h2>
              <p>{ct(lang, 'cash_no_access')}</p>
            </div>
          </div>
        </main>
      )}
      <Footer lang={lang} />
    </div>
  );
}
