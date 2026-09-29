import { CashBar } from '@/components/cash/cash-bar';
import { ThemeSwitch } from '@/components/cash/theme-switch';
import { Footer } from '@/components/top-bar';
import { getCashViewer } from '@/lib/cash/viewer';
import { ct } from '@/lib/cash/i18n';
import { getCashTheme } from '@/lib/cash/theme';
import { loadBar } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import './cash.css';

/** Its own name in the browser tab too: it is an app, not a page of the portal. */
export const metadata: Metadata = { title: 'Cash Balancing' };

/**
 * Cash Balancing as its own app: its own bar (cash-bar.tsx; owner's call, 2026-09-29,
 * it used to sit under the portal's bar), in the app's OWN theme (safe-count
 * Styles.html: charcoal and gold, or the pale green light one), not the portal's. Owner's call, 2026-09-28: "i dont like it having the same
 * theme as the portal". The layout and words are the old app's.
 * Drawing only: each page and action authorises for itself.
 */
export default async function CashLayout({ children }: LayoutProps<'/cash'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const [bar, cash, theme] = await Promise.all([loadBar(viewer), getCashViewer(), getCashTheme()]);

  return (
    <div className="cb-app" data-theme={theme ?? undefined}>
      <CashBar
        lang={lang}
        viewer={bar}
        canCount={cash?.canCount ?? false}
        isAdmin={cash?.isAdmin ?? false}
        theme={<ThemeSwitch lang={lang} chosen={theme} />}
      />
      {cash ? (
        children
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
