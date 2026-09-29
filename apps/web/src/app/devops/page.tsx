import { OverviewGrid } from '@/components/devops/overview-grid';
import { NewProjectButton } from '@/components/devops/project-dialogs';
import { devopsDb } from '@/lib/devops/db';
import { dt } from '@/lib/devops/i18n';
import { listProjects } from '@/lib/devops/store';
import { getDevopsViewer } from '@/lib/devops/viewer';
import { getLang } from '@/lib/lang';
import { businessDate } from '@hub/core';

/** Vue d'ensemble: every project and its counts. */
export default async function DevopsOverviewPage() {
  const [viewer, lang] = await Promise.all([getDevopsViewer(), getLang()]);
  if (!viewer) return null;
  const projects = await listProjects(devopsDb(), businessDate());

  return (
    <main id="main" className="dv-page" lang={lang}>
      <div className="dv-head">
        <div>
          <h1>{dt(lang, 'nav_overview')}</h1>
          <p>{dt(lang, 'overview_line')}</p>
        </div>
        <NewProjectButton lang={lang} />
      </div>
      <OverviewGrid
        lang={lang}
        projects={projects.map((p) => ({ id: p.id, name: p.name, githubRepo: p.githubRepo, counts: p.counts }))}
      />
    </main>
  );
}
