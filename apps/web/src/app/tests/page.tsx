import { BetaCard } from '@/components/beta-card';
import { TestersView } from '@/components/testers-view';
import { Footer, TopBar } from '@/components/top-bar';
import { BETA_APPS } from '@/lib/beta/apps';
import { testingApps } from '@/lib/beta/rules';
import { testerOf, testersPage } from '@/lib/beta/testers';
import { db } from '@/lib/db';
import { loadHome } from '@/lib/home-data';
import { formatDay, t } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster, getViewer } from '@/lib/viewer';
import { notFound, redirect } from 'next/navigation';

/**
 * Tests (owner, 2026-09-30): the beta apps. A tester sees the ones they test and can
 * open; a system admin sees every beta, its testers, and adds or removes them. Anyone
 * else gets a 404, so the page is not advertised. Drawing only: the beta itself checks
 * every click with authorizeBeta().
 */
export default async function TestsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const isAdmin = viewer.standing === 'admin';

  const [home, roster, mine] = await Promise.all([loadHome(viewer, lang), getRoster(), testerOf(db(), viewer.email)]);
  const apps = testingApps(roster, viewer.email, mine);
  if (!isAdmin && !apps.length) notFound();

  const admin = isAdmin ? await Promise.all([testersPage(db()), listRestaurants()]) : null;

  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <main id="main" className="page" lang={lang}>
        <div className="pagehead">
          <h1>{t(lang, 'testsTitle')}</h1>
          <p>{t(lang, isAdmin ? 'testsLineAdmin' : 'testsLineTester')}</p>
        </div>
        {!BETA_APPS.length && <p className="favempty">{t(lang, 'testsNone')}</p>}
        {admin ? (
          <TestersView
            lang={lang}
            betas={admin[0].map((b) => ({
              ...b,
              testers: b.testers.map((x) => ({ ...x, addedAt: formatDay(lang, x.addedAt) })),
            }))}
            storeNames={Object.fromEntries(admin[1].map((r) => [r.id, r.name]))}
          />
        ) : (
          <div className="appgrid">
            {apps.map((a) => (
              <BetaCard key={a.key} lang={lang} app={a} />
            ))}
          </div>
        )}
      </main>
      <Footer lang={lang} />
    </>
  );
}
