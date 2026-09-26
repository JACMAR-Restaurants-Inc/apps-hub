import { HomeView } from '@/components/home-view';
import { Footer, TopBar } from '@/components/top-bar';
import { loadHome } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { notFound, redirect } from 'next/navigation';

/**
 * "Mes applications" / "Autres outils" as pages of their own (§57), with the search on
 * them. A real URL now: the old portal made them views only because leaving its page
 * cost a sign-in.
 */
export default async function GroupPage({ params }: PageProps<'/apps/[group]'>) {
  const { group } = await params;
  if (group !== 'internal' && group !== 'external') notFound();
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');

  const home = await loadHome(viewer, lang);
  if (!home.sections.some((s) => s.kind === group)) notFound();
  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <HomeView lang={lang} head={home.head} sections={home.sections} categories={home.categories} group={group} />
      <Footer lang={lang} />
    </>
  );
}
