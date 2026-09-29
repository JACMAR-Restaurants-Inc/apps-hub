'use client';

import { dt } from '@/lib/devops/i18n';
import type { Counts } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useState } from 'react';
import { ProjectMark } from './ui';

export interface OverviewProject {
  prefix: string;
  name: string;
  githubRepo: string | null;
  archived: boolean;
  counts: Counts;
}

/** The old Dashboard: a search, then a card per project with its counts. */
export function OverviewGrid({ lang, projects }: { lang: Lang; projects: OverviewProject[] }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hit = (p: OverviewProject) => !needle || p.name.toLowerCase().includes(needle) || p.prefix.toLowerCase().includes(needle);
  const active = projects.filter((p) => !p.archived && hit(p));
  const archived = projects.filter((p) => p.archived && hit(p));

  if (!projects.length) return <p className="dv-note">{dt(lang, 'no_projects')}</p>;
  return (
    <>
      <input className="dv-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt(lang, 'search_projects')} aria-label={dt(lang, 'search_projects')} />
      {!active.length && !archived.length && <p className="dv-note">{dt(lang, 'no_project_match')}</p>}
      {active.length > 0 && (
        <ul className="dv-cards">
          {active.map((p) => (
            <Card key={p.prefix} lang={lang} p={p} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <section className="dv-archived" id="archived">
          <h2>{dt(lang, 'archived_projects')}</h2>
          <ul className="dv-cards">
            {archived.map((p) => (
              <Card key={p.prefix} lang={lang} p={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Card({ lang, p }: { lang: Lang; p: OverviewProject }) {
  const c = p.counts;
  return (
    <li className={`dv-card dv-pcard${p.archived ? ' is-archived' : ''}`}>
      <div className="dv-pcard-top">
        <ProjectMark prefix={p.prefix} name={p.name} />
        {p.archived && <span className="dv-badge">{dt(lang, 'archived_tag')}</span>}
      </div>
      <Link href={`/devops/${p.prefix}`} className="dv-pcard-name">
        {p.name}
      </Link>
      <p className="dv-key">{p.prefix}-###</p>
      <p className="dv-pills">
        <span className="dv-pill dv-s-new-soft">
          {c.new} {dt(lang, c.new < 2 ? 'pill_new' : 'pill_new_n')}
        </span>
        <span className="dv-pill dv-s-active-soft">
          {c.active} {dt(lang, c.active < 2 ? 'pill_active' : 'pill_active_n')}
        </span>
        <span className="dv-pill dv-s-completed-soft">
          {c.completed} {dt(lang, c.completed < 2 ? 'pill_completed' : 'pill_completed_n')}
        </span>
        {c.overdue > 0 && (
          <span className="dv-pill dv-overdue-soft">
            {c.overdue} {dt(lang, 'overdue_n')}
          </span>
        )}
      </p>
    </li>
  );
}
