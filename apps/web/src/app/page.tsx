import { Door, doorError } from '@/components/door';
import { HomeView } from '@/components/home-view';
import { Footer, TopBar } from '@/components/top-bar';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';

/**
 * The portal: the door when signed out, the catalogue when signed in. Everyone sees
 * every app they may, and each card says where they stand (RBAC §45).
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const [viewer, lang, sp] = await Promise.all([getViewer(), getLang(), searchParams]);
  if (!viewer) return <Door lang={lang} error={doorError(typeof sp.error === 'string' ? sp.error : undefined)} />;

  const home = await loadHome(viewer, lang);
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <HomeView lang={lang} head={home.head} sections={home.sections} categories={home.categories} group={null} />
      <Footer lang={lang} />
    </>
  );
}
