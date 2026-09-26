import { Directory, type DirData } from '@/components/directory';
import { Footer, TopBar } from '@/components/top-bar';
import { CATALOGUE } from '@/lib/catalogue';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { directory, people } from '@/lib/requests/queries';
import { getRoster, getViewer } from '@/lib/viewer';
import { isSystemAdmin } from '@hub/rbac';
import { notFound } from 'next/navigation';

/**
 * The access directory (RBAC §48/§62), system admins only. Hiding the page is courtesy;
 * the protection is requireSystemAdmin in every action it calls.
 */
export default async function AccessPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (viewer?.standing !== 'admin') notFound();

  const roster = await getRoster();
  const [home, list, dir] = await Promise.all([loadHome(viewer, lang), people((e) => isSystemAdmin(roster, e)), directory()]);

  const data: DirData = {
    people: list.map((p) => ({
      ...p,
      addedAt: p.addedAt.toISOString(),
      apps: p.apps.map((a) => ({ ...a, since: a.since?.toISOString() ?? null })),
    })),
    restaurants: dir.restaurants,
    appInfo: CATALOGUE.filter((a) => a.governed).map((a) => ({
      key: a.key,
      name: a.name,
      nameFr: a.nameFr,
      roles: dir.rolesByApp[a.key] ?? [],
      help: a.roleHelp ?? {},
    })),
    fetchedAt: new Date().toISOString(),
  };

  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <Directory lang={lang} data={data} />
      <Footer lang={lang} />
    </>
  );
}
