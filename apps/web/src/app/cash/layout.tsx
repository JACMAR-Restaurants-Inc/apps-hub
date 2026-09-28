import { CashNav } from '@/components/cash/cash-nav';
import { Footer, TopBar } from '@/components/top-bar';
import { getCashViewer } from '@/lib/cash/viewer';
import { ct } from '@/lib/cash/i18n';
import { loadBar } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import './cash.css';

/**
 * Cash Balancing inside the portal: the portal's bar, then the app's own tabs. The
 * owner's call (2026-09-28): the portal's look, the old app's layout and words.
 * Drawing only: each page and action authorises for itself.
 */
export default async function CashLayout({ children }: LayoutProps<'/cash'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const [bar, cash] = await Promise.all([loadBar(viewer), getCashViewer()]);

  return (
    <>
      <TopBar lang={lang} viewer={bar} />
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
    </>
  );
}
