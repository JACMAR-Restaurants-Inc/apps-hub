import { CommentForm, DeleteIssue, IssueEditor } from '@/components/devops/issue-editor';
import { Key, colon, showDate, showWhen } from '@/components/devops/ui';
import { devopsDb } from '@/lib/devops/db';
import { dt, type DevopsKey } from '@/lib/devops/i18n';
import { isPriority, isStatus, isType, issueKey } from '@/lib/devops/rules';
import { FIELDS, fieldValue, isField, issueByKey, issueThread, type EventRow, type Field } from '@/lib/devops/store';
import { getDevopsViewer, nameOf, type DevopsViewer } from '@/lib/devops/viewer';
import type { Lang } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { businessDate } from '@hub/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

export async function generateMetadata({ params }: PageProps<'/devops/[prefix]/[number]'>): Promise<Metadata> {
  const { prefix, number } = await params;
  return { title: `${issueKey(prefix.toUpperCase(), Number(number) || 0)} · JM DevOps` };
}

/**
 * One issue, at its own address (/devops/CHK/66), so a link can be pasted anywhere and
 * a refresh keeps it. The old app showed issues only in a modal. Its fields, then
 * comments (they replace the sheet's one-line Notes), then its history.
 */
export default async function IssuePage({ params }: PageProps<'/devops/[prefix]/[number]'>) {
  const [viewer, lang, { prefix, number }] = await Promise.all([getDevopsViewer(), getLang(), params]);
  if (!viewer) return null;
  const n = /^\d{1,6}$/.test(number) ? Number(number) : NaN;
  const found = await issueByKey(devopsDb(), prefix, n);
  if (!found) notFound();
  const { project, issue } = found;
  // One address per issue: /devops/chk/066 goes to /devops/CHK/66.
  if (project.prefix !== prefix || String(issue.number) !== number) redirect(`/devops/${project.prefix}/${issue.number}`);
  const { comments, events } = await issueThread(devopsDb(), issue.id);
  const values = Object.fromEntries(FIELDS.map((f) => [f, fieldValue(issue, f)])) as Record<Field, string>;
  const creator = nameOf(viewer.people, issue.createdBy);

  return (
    <main id="main" className="dv-page dv-issue" lang={lang}>
      <nav className="dv-crumbs" aria-label={project.name}>
        <Link href={`/devops/${project.prefix}`} className="dv-link">
          {project.name}
        </Link>
        <span aria-hidden="true">/</span>
        <Key prefix={project.prefix} number={issue.number} />
      </nav>
      {issue.status === 'cancelled' && issue.cancelReason && (
        <p className="dv-note">
          <b>{dt(lang, 'status_cancelled')}.</b> {dt(lang, 'ev_reason')}
          {colon(lang)}
          {issue.cancelReason}
        </p>
      )}

      <section className="dv-card dv-issuecard">
        <IssueEditor lang={lang} issue={{ id: issue.id, prefix: project.prefix, number: issue.number, values, assigneeText: issue.assigneeText }} people={viewer.people} />
        <footer className="dv-issuefoot">
          <p className="dv-muted">
            {creator ? `${dt(lang, 'created_by')} ${creator} ${dt(lang, 'created_on')}` : dt(lang, 'created_imported')} {showDate(lang, issue.createdOn)}
          </p>
          <DeleteIssue lang={lang} issueId={issue.id} prefix={project.prefix} number={issue.number} />
        </footer>
      </section>

      <section className="dv-card dv-thread">
        <h2>{dt(lang, 'comments')}</h2>
        {comments.length ? (
          <ol className="dv-comments">
            {comments.map((c) => (
              <li key={c.id}>
                <p className="dv-meta">
                  {/* The sheet's notes have a day, not a time: show only the day. */}
                  <b>{c.authorEmail ? nameOf(viewer.people, c.authorEmail) : dt(lang, 'sheet_notes')}</b> · {c.authorEmail ? showWhen(lang, c.createdAt) : showDate(lang, businessDate(c.createdAt))}
                </p>
                <p className="dv-body">{c.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="dv-muted">{dt(lang, 'no_comments')}</p>
        )}
        <CommentForm lang={lang} issueId={issue.id} />
      </section>

      <section className="dv-card dv-thread">
        <h2>{dt(lang, 'history')}</h2>
        <ol className="dv-history">
          {events.map((e) => (
            <li key={e.id}>
              <span className="dv-meta">{showWhen(lang, e.at)}</span> <HistoryLine lang={lang} e={e} viewer={viewer} />
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

/** One line of history, in words: who changed what, from what, to what. */
function HistoryLine({ lang, e, viewer }: { lang: Lang; e: EventRow; viewer: DevopsViewer }) {
  const who = <b>{nameOf(viewer.people, e.actorEmail) ?? dt(lang, 'from_sheet')}</b>;
  if (e.event === 'imported') return <>{dt(lang, 'ev_imported')}</>;
  if (e.event === 'created') return <>{who} {dt(lang, 'ev_created')}</>;
  // A field the app no longer has (the old "Requested by", dropped 2026-09-29): said plainly.
  if (!isField(e.event)) return <>{who} {dt(lang, 'ev_changed')} {e.event}</>;
  const field = e.event;
  const show = (v: string | null) => {
    if (!v) return '–';
    if (field === 'status' && isStatus(v)) return dt(lang, `status_${v}`);
    if (field === 'type' && isType(v)) return dt(lang, `type_${v}`);
    if (field === 'priority' && isPriority(v)) return dt(lang, `priority_${v}`);
    if (field === 'assignee') return v.startsWith('~') ? v.slice(1) : (nameOf(viewer.people, v) ?? v);
    if (field === 'dueDate') return showDate(lang, v);
    if (field === 'description') return v.length > 80 ? `${v.slice(0, 80)}…` : v;
    return v;
  };
  const reason = (e.detail as { reason?: string } | null)?.reason;
  const label = dt(lang, `field_${field}` as DevopsKey).toLowerCase();
  return (
    <>
      {who} {dt(lang, e.after ? 'ev_changed' : 'ev_cleared')} {label}
      {e.after ? (
        <>
          {colon(lang)}
          <span className="dv-old">{show(e.before)}</span> → {show(e.after)}
        </>
      ) : (
        <>
          {colon(lang)}
          <span className="dv-old">{show(e.before)}</span>
        </>
      )}
      {reason && (
        <>
          {' '}
          ({dt(lang, 'ev_reason')}
          {colon(lang)}
          {reason})
        </>
      )}
    </>
  );
}
