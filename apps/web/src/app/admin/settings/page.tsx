import { SettingsView } from '@/components/settings-view';
import { Footer, TopBar } from '@/components/top-bar';
import { db } from '@/lib/db';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { admins, restaurants, users } from '@hub/db';
import { asc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';

/** Administration: the Admins tab and the restaurants (parity checklist D). Admins only. */
export default async function SettingsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  // Signed out (or the session expired, e.g. while the directory refreshed itself):
  // back to the door. Signed in but not an admin: a 404, so the page is not advertised.
  if (!viewer) redirect('/');
  if (viewer.standing !== 'admin') notFound();
  const [home, adminRows, storeRows] = await Promise.all([
    loadHome(viewer, lang),
    db()
      .select({ email: admins.email, notify: admins.notify, fullName: users.fullName })
      .from(admins)
      .innerJoin(users, eq(users.email, admins.email))
      .orderBy(asc(users.fullName)),
    db().select({ id: restaurants.restaurantId, name: restaurants.name, active: restaurants.active }).from(restaurants),
  ]);
  const data = {
    me: viewer.email,
    admins: adminRows,
    restaurants: storeRows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
  };
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <SettingsView lang={lang} data={data} />
      <Footer lang={lang} />
    </>
  );
}
