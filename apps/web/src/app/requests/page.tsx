import { Footer, TopBar } from '@/components/top-bar';
import { loadHome, loadMyRequests } from '@/lib/home-data';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';

/**
 * Demandes: the signed-in person's access requests still waiting for the office, and
 * only those (owner's call, 2026-09-26). A granted request shows as an app they hold;
 * a declined one as an app they can ask for again.
 */
export default async function RequestsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');

  const [home, requests] = await Promise.all([loadHome(viewer, lang), loadMyRequests(viewer, lang)]);
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <main id="main" className="page" lang={lang}>
        <div className="pagehead">
          <h1>{t(lang, 'requestsTitle')}</h1>
          <p>{t(lang, 'requestsLine')}</p>
        </div>
        {requests.length === 0 ? (
          <p className="favempty">{t(lang, 'requestsNone')}</p>
        ) : (
          <ul className="reqlist">
            {requests.map((r) => (
              <li key={r.key}>
                <b>{r.name}</b>
                <span>{t(lang, 'requestDay').replace('{date}', r.day)}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer lang={lang} />
    </>
  );
}
