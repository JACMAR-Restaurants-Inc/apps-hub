import { SettingsView } from '@/components/settings-view';
import { Footer, TopBar } from '@/components/top-bar';
import { db } from '@/lib/db';
import { settingsPageData } from '@/lib/admin/settings';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { notFound, redirect } from 'next/navigation';

/** Administration: the Admins tab and the restaurants (parity checklist D). Admins only. */
export default async function SettingsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  // Signed out (or the session expired, e.g. while the directory refreshed itself):
  // back to the door. Signed in but not an admin: a 404, so the page is not advertised.
  if (!viewer) redirect('/');
  if (viewer.standing !== 'admin') notFound();
  const [home, rows] = await Promise.all([loadHome(viewer, lang), settingsPageData(db())]);
  const data = { me: viewer.email, ...rows };
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <SettingsView lang={lang} data={data} />
      <Footer lang={lang} />
    </>
  );
}
