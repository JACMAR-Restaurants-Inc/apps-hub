import { Board } from '@/components/devops/board';
import { FilterBar } from '@/components/devops/filter-bar';
import { NewIssueButton } from '@/components/devops/new-issue';
import { ManageProject } from '@/components/devops/project-dialogs';
import { Key, PriorityBadge, ProjectMark, StatusTag, TypeBadge, showDate } from '@/components/devops/ui';
import { devopsDb } from '@/lib/devops/db';
import { dt, issuesWord, type DevopsKey } from '@/lib/devops/i18n';
import { PRIORITIES, STATUSES, TYPES, completion, countIssues, isOverdue, matches, parseFilters, type Counts } from '@/lib/devops/rules';
import { listIssues, projectByPrefix, type IssueRow } from '@/lib/devops/store';
import { getDevopsViewer, nameOf, type DevopsViewer } from '@/lib/devops/viewer';
import type { Lang } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { businessDate } from '@hub/core';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

// Dashboard first and by default (owner, 2026-09-29); the old app opened on the Board.
const VIEWS = ['dashboard', 'board', 'list'] as const;
type View = (typeof VIEWS)[number];

/**
 * A project (the old ProjectView): its Dashboard (the default), Board and List, and the
 * filters for the last two. Everything is in the address: the view, the filters, the
 * project. The old app had no router, so a refresh lost your place.
 */
export default async function ProjectPage({ params, searchParams }: PageProps<'/devops/[prefix]'>) {
  const [viewer, lang, { prefix }, sp] = await Promise.all([getDevopsViewer(), getLang(), params, searchParams]);
  if (!viewer) return null;
  const project = await projectByPrefix(devopsDb(), prefix);
  if (!project) notFound();
  if (project.prefix !== prefix) redirect(`/devops/${project.prefix}`);

  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'dashboard';
  const filters = parseFilters(sp);
  const today = businessDate();
  const all = await listIssues(devopsDb(), project.id);
  const shown = all.filter((i) => matches(i, project.prefix, filters));
  const readOnly = !!project.archivedAt;
  const tabHref = (v: View) => {
    const q = new URLSearchParams();
    if (v !== 'dashboard') q.set('view', v);
    if (v !== 'dashboard') for (const k of ['q', 'type', 'priority', 'assignee'] as const) if (filters[k]) q.set(k, filters[k]);
    return `/devops/${project.prefix}${q.size ? `?${q}` : ''}`;
  };

  return (
    <main id="main" className="dv-page" lang={lang}>
      <div className="dv-head">
        <div className="dv-head-title">
          <ProjectMark prefix={project.prefix} name={project.name} size={44} />
          <div>
            <h1>{project.name}</h1>
            <p>
              <span className="dv-key">{project.prefix}</span> · {all.length} {issuesWord(lang, all.length)}
              {project.githubRepo && (
                <>
                  {' · '}
                  <a href={project.githubRepo} className="dv-link" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="dv-head-actions">
          {!readOnly && <NewIssueButton lang={lang} projectId={project.id} prefix={project.prefix} people={viewer.people} />}
          <ManageProject lang={lang} project={{ id: project.id, name: project.name, prefix: project.prefix, githubRepo: project.githubRepo, archived: readOnly }} />
        </div>
      </div>
      {readOnly && <p className="dv-note">{dt(lang, 'archived_banner')}</p>}

      <nav className="dv-tabs" aria-label={project.name}>
        {VIEWS.map((v) => (
          <Link key={v} href={tabHref(v)} aria-current={v === view ? 'page' : undefined} scroll={false}>
            {dt(lang, `tab_${v}`)}
          </Link>
        ))}
      </nav>

      {view !== 'dashboard' && <FilterBar key={view} lang={lang} filters={filters} people={viewer.people} />}

      {view === 'board' && (
        <Board
          lang={lang}
          prefix={project.prefix}
          readOnly={readOnly}
          cancelled={shown.filter((i) => i.status === 'cancelled').length}
          issues={shown
            .filter((i) => i.status !== 'cancelled')
            .map((i) => ({
              id: i.id,
              number: i.number,
              title: i.title,
              type: i.type,
              status: i.status,
              priority: i.priority,
              assignee: person(viewer, i),
              dueDate: i.dueDate,
              overdue: isOverdue(i, today),
            }))}
        />
      )}
      {view === 'list' && <IssueList lang={lang} prefix={project.prefix} issues={shown} viewer={viewer} today={today} />}
      {view === 'dashboard' && <ProjectDashboard lang={lang} counts={countIssues(all, today)} issues={all} />}
    </main>
  );
}

/** The assignee's name, or the sheet's text for one that matched nobody. */
function person(viewer: DevopsViewer, i: Pick<IssueRow, 'assigneeEmail' | 'assigneeText'>): string | null {
  return nameOf(viewer.people, i.assigneeEmail) ?? i.assigneeText;
}

/** The old IssueTable, every status, newest first; a row opens the issue. */
function IssueList({ lang, prefix, issues, viewer, today }: { lang: Lang; prefix: string; issues: IssueRow[]; viewer: DevopsViewer; today: string }) {
  if (!issues.length) return <p className="dv-note">{dt(lang, 'no_issue_match')}</p>;
  return (
    <div className="dv-tablewrap">
      <table className="dv-table">
        <thead>
          <tr>
            <th scope="col">{dt(lang, 'col_key')}</th>
            <th scope="col">{dt(lang, 'field_title')}</th>
            <th scope="col">{dt(lang, 'field_type')}</th>
            <th scope="col">{dt(lang, 'field_status')}</th>
            <th scope="col">{dt(lang, 'field_priority')}</th>
            <th scope="col">{dt(lang, 'field_assignee')}</th>
            <th scope="col">{dt(lang, 'field_dueDate')}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => {
            const late = isOverdue(i, today);
            return (
              <tr key={i.id} className={i.status === 'cancelled' ? 'is-cancelled' : undefined}>
                <td>
                  <Key prefix={prefix} number={i.number} />
                </td>
                <td>
                  <Link href={`/devops/${prefix}/${i.number}`} className="dv-rowlink">
                    {i.title}
                  </Link>
                </td>
                <td>
                  <TypeBadge lang={lang} type={i.type} />
                </td>
                <td>
                  <StatusTag lang={lang} status={i.status} />
                </td>
                <td>
                  <PriorityBadge lang={lang} priority={i.priority} />
                </td>
                <td>{person(viewer, i) ?? '–'}</td>
                <td className={late ? 'dv-late' : undefined}>{i.dueDate ? `${late ? `${dt(lang, 'overdue')} · ` : ''}${showDate(lang, i.dueDate)}` : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The old ProjectDashboard: completion, the status ring, bars by type and priority.
 * Drawn here as plain SVG and HTML, no chart library, with the numbers in words
 * beside every shape.
 */
function ProjectDashboard({ lang, counts, issues }: { lang: Lang; counts: Counts; issues: IssueRow[] }) {
  const pct = completion(counts);
  const meant = counts.total - counts.cancelled;
  const ring = STATUSES.map((s) => ({ s, n: counts[s] })).filter((x) => x.n > 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  // Each segment's length, and where it starts: the lengths before it, added up.
  const segs = ring.map((x, k) => {
    const len = (x.n / Math.max(1, counts.total)) * C;
    const start = ring.slice(0, k).reduce((sum, y) => sum + (y.n / Math.max(1, counts.total)) * C, 0);
    return { ...x, len, start };
  });
  const bars = (keys: readonly string[], of: (i: IssueRow) => string, label: (k: string) => DevopsKey, cls: (k: string) => string) => {
    const n = keys.map((k) => ({ k, n: issues.filter((i) => of(i) === k).length }));
    const max = Math.max(1, ...n.map((x) => x.n));
    return (
      <ul className="dv-bars">
        {n.map(({ k, n: v }) => (
          <li key={k}>
            <span className="dv-bar-label">{dt(lang, label(k))}</span>
            <span className="dv-bar-track">
              <span className={`dv-bar-fill ${cls(k)}`} style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="dv-bar-n">{v}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="dv-dash">
      <section className="dv-card dv-dash-card">
        <h2>{dt(lang, 'dash_completion')}</h2>
        <p className="dv-big">{pct}%</p>
        <p className="dv-muted">
          {counts.completed} {dt(lang, 'dash_done_of')} {meant}
          {counts.overdue > 0 && (
            <span className="dv-pill dv-overdue-soft">
              {counts.overdue} {dt(lang, 'overdue_n')}
            </span>
          )}
        </p>
        <span className="dv-progress" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        {counts.cancelled > 0 && <p className="dv-muted small">{dt(lang, 'dash_cancelled_note')}</p>}
      </section>
      <section className="dv-card dv-dash-card">
        <h2>{dt(lang, 'dash_by_status')}</h2>
        <div className="dv-donut">
          <svg viewBox="0 0 100 100" role="img" aria-label={ring.map((x) => `${dt(lang, `status_${x.s}`)} ${x.n}`).join(', ')}>
            <circle cx="50" cy="50" r={R} className="dv-donut-track" />
            {segs.map(({ s, len, start }) => (
              <circle key={s} cx="50" cy="50" r={R} className={`dv-donut-seg dv-f-${s}`} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-start} />
            ))}
            <text x="50" y="48" textAnchor="middle" className="dv-donut-n">
              {counts.total}
            </text>
            <text x="50" y="62" textAnchor="middle" className="dv-donut-l">
              {issuesWord(lang, counts.total)}
            </text>
          </svg>
          <ul className="dv-legend">
            {STATUSES.map((s) => (
              <li key={s}>
                <StatusTag lang={lang} status={s} />
                <b>{counts[s]}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="dv-card dv-dash-card">
        <h2>{dt(lang, 'dash_by_type')}</h2>
        {bars(TYPES, (i) => i.type, (k) => `type_${k}` as DevopsKey, (k) => `dv-type-${k}`)}
      </section>
      <section className="dv-card dv-dash-card">
        <h2>{dt(lang, 'dash_by_priority')}</h2>
        {bars(PRIORITIES, (i) => i.priority, (k) => `priority_${k}` as DevopsKey, (k) => `dv-pri-${k}`)}
      </section>
    </div>
  );
}
