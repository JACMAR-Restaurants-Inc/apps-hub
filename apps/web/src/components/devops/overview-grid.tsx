'use client';

import { dt } from '@/lib/devops/i18n';
import type { Counts } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useState } from 'react';
import { ProjectMark } from './ui';

export interface OverviewProject {
  id: number;
  name: string;
  githubRepo: string | null;
  counts: Counts;
}

/** The old Dashboard: a search, then a card per project with its counts. */
export function OverviewGrid({ lang, projects }: { lang: Lang; projects: OverviewProject[] }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hit = (p: OverviewProject) => !needle || p.name.toLowerCase().includes(needle);
  const shown = projects.filter(hit);

  if (!projects.length) return <p className="dv-note">{dt(lang, 'no_projects')}</p>;
  return (
    <>
      <input className="dv-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt(lang, 'search_projects')} aria-label={dt(lang, 'search_projects')} />
      {!shown.length && <p className="dv-note">{dt(lang, 'no_project_match')}</p>}
      {shown.length > 0 && (
        <ul className="dv-cards">
          {shown.map((p) => (
            <Card key={p.id} lang={lang} p={p} />
          ))}
        </ul>
      )}
    </>
  );
}

function Card({ lang, p }: { lang: Lang; p: OverviewProject }) {
  const c = p.counts;
  return (
    <li className="dv-card dv-pcard">
      <div className="dv-pcard-top">
        <ProjectMark id={p.id} name={p.name} />
        {c.overdue > 0 && (
          <span className="dv-pill dv-overdue-soft">
            {c.overdue} {dt(lang, 'overdue_n')}
          </span>
        )}
      </div>
      <Link href={`/devops/${p.id}`} className="dv-pcard-name">
        {p.name}
      </Link>
      {/* Always the same three boxes, number over word, so every card's row lines up
          (owner, 2026-09-29). "En retard", which only some cards have, sits at the top. */}
      <p className="dv-pills">
        <span className="dv-pill dv-s-new-soft">
          <b>{c.new}</b> {dt(lang, c.new < 2 ? 'pill_new' : 'pill_new_n')}
        </span>
        <span className="dv-pill dv-s-active-soft">
          <b>{c.active}</b> {dt(lang, c.active < 2 ? 'pill_active' : 'pill_active_n')}
        </span>
        <span className="dv-pill dv-s-completed-soft">
          <b>{c.completed}</b> {dt(lang, c.completed < 2 ? 'pill_completed' : 'pill_completed_n')}
        </span>
      </p>
    </li>
  );
}
