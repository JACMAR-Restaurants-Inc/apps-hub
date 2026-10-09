import { Footer, TopBar } from '@/components/top-bar';
import { loadBar } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import './forms.css';

/**
 * Forms (owner, 2026-10-09), in the portal's own bar: a part of the portal more than an
 * app of its own look. Drawing only: every page decides what it shows, every action
 * checks for itself.
 */
export default async function FormsLayout({ children }: LayoutProps<'/forms'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  return (
    <>
      <TopBar lang={lang} viewer={await loadBar(viewer)} />
      <main id="main" className="page" lang={lang}>
        {children}
      </main>
      <Footer lang={lang} />
    </>
  );
}
