import { HomeView } from '@/components/home-view';
import { Footer, TopBar } from '@/components/top-bar';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';

/**
 * Applications: every app the person may see, in one list with the search (owner's
 * redesign, 2026-09-26). It replaced the two group pages, /apps/internal and
 * /apps/external (§57), which next.config.ts now sends here.
 */
export default async function AppsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');

  const home = await loadHome(viewer, lang);
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <HomeView lang={lang} head={home.head} cards={home.cards} favourites={home.favourites} categories={home.categories} page="apps" />
      <Footer lang={lang} />
    </>
  );
}
