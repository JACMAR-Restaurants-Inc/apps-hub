import { DevopsChrome } from '@/components/devops/chrome';
import { Footer } from '@/components/top-bar';
import { devopsDb } from '@/lib/devops/db';
import { dt } from '@/lib/devops/i18n';
import { getDevopsTheme, getDevopsViewer } from '@/lib/devops/viewer';
import { projects } from '@hub/db';
import { loadBar } from '@/lib/home-data';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import { sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { redirect } from 'next/navigation';
import './devops.css';

/** Its own name and ring in the browser tab: an app, not a page of the portal. */
export const metadata: Metadata = {
  title: 'JM DevOps',
  icons: { icon: [{ url: '/brand/jm-devops-mark.png', type: 'image/png' }] },
};

// The old app's face (index.html loaded DM Sans 400 to 700).
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans' });

/**
 * JM DevOps, the office's project tracker, as its own app (owner, 2026-09-29): its own
 * bar, sidebar and theme, the portal's sign-in. System admins only; anyone else sees
 * that, and nothing of the data. Drawing only: every action checks for itself.
 */
export default async function DevopsLayout({ children }: LayoutProps<'/devops'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const [bar, devops, theme] = await Promise.all([loadBar(viewer), getDevopsViewer(), getDevopsTheme()]);
  const list = devops
    ? await devopsDb()
        .select({ prefix: projects.prefix, name: projects.name })
        .from(projects)
        .orderBy(sql`lower(${projects.name})`)
    : [];

  return (
    <div className={`dv-app ${dmSans.variable}`} data-theme={theme ?? undefined}>
      <DevopsChrome lang={lang} viewer={bar} projects={list} theme={theme}>
        {devops ? (
          children
        ) : (
          <main id="main" className="dv-page" lang={lang}>
            <p className="dv-note">{dt(lang, 'no_access')}</p>
          </main>
        )}
        <Footer lang={lang} />
      </DevopsChrome>
    </div>
  );
}
