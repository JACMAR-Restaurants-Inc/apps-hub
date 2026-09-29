'use client';

import { updateIssueAction } from '@/app/devops/actions';
import { dt } from '@/lib/devops/i18n';
import { BOARD_STATUSES, type IssuePriority, type IssueStatus, type IssueType } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { Key, PriorityBadge, TypeBadge, outcomeText, showDate } from './ui';

export interface BoardIssue {
  id: number;
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null;
  dueDate: string | null;
  overdue: boolean;
}

/**
 * The board: New, Active, Completed (the old KanbanBoard), cancelled issues left to the
 * list. Every card has a "Move to" menu, which is THE way to change status on a phone
 * and with a keyboard (WCAG 2.5.7: never only by dragging); on a computer, cards can
 * also be dragged between columns. The old board could only change status in the
 * modal.
 */
export function Board({ lang, prefix, issues, cancelled }: { lang: Lang; prefix: string; issues: BoardIssue[]; cancelled: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<IssueStatus | null>(null);
  const [, start] = useTransition();
  const [shown, move] = useOptimistic(issues, (list, m: { id: number; status: IssueStatus }) => list.map((i) => (i.id === m.id ? { ...i, status: m.status } : i)));

  const moveTo = (i: BoardIssue, status: IssueStatus) => {
    if (i.status === status) return;
    setMessage(null);
    start(async () => {
      move({ id: i.id, status });
      const out = await updateIssueAction(i.id, 'status', i.status, status);
      const text = outcomeText(lang, out.outcome);
      if (text) setMessage(text);
      router.refresh();
    });
  };

  return (
    <>
      {message && (
        <p className="dv-error" role="alert">
          {message}
        </p>
      )}
      <div className="dv-board">
        {BOARD_STATUSES.map((status) => {
          const col = shown.filter((i) => i.status === status);
          return (
            <section
              key={status}
              className={`dv-col${over === status ? ' is-over' : ''}`}
              aria-label={dt(lang, `status_${status}`)}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const i = shown.find((x) => x.id === dragging);
                setDragging(null);
                if (i) moveTo(i, status);
              }}
            >
              <h2 className="dv-colhead">
                <span className={`dv-sdot dv-s-${status}`} aria-hidden="true" />
                {dt(lang, `status_${status}`)}
                <span className="dv-count">{col.length}</span>
              </h2>
              {col.length ? (
                <ul className="dv-colcards">
                  {col.map((i) => (
                    <li
                      key={i.id}
                      className={`dv-card dv-icard${dragging === i.id ? ' is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        setDragging(i.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                    >
                      <Key prefix={prefix} number={i.number} />
                      <Link href={`/devops/${prefix}/${i.number}`} className="dv-icard-title">
                        {i.title}
                      </Link>
                      <p className="dv-badges">
                        <TypeBadge lang={lang} type={i.type} />
                        <PriorityBadge lang={lang} priority={i.priority} />
                      </p>
                      <p className="dv-icard-foot">
                        <span className="dv-who">{i.assignee ?? '–'}</span>
                        {i.dueDate && (
                          <span className={i.overdue ? 'dv-late' : 'dv-due'}>
                            {i.overdue ? dt(lang, 'overdue') : dt(lang, 'due')} · {showDate(lang, i.dueDate)}
                          </span>
                        )}
                      </p>
                      <select className="dv-move" value={i.status} onChange={(e) => moveTo(i, e.target.value as IssueStatus)} aria-label={`${dt(lang, 'move_to')} (${prefix}-${i.number})`}>
                          {BOARD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s === i.status ? dt(lang, `status_${s}`) : `${dt(lang, 'move_to')} ${dt(lang, `status_${s}`)}`}
                            </option>
                          ))}
                        </select>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dv-empty">{dt(lang, 'no_issues')}</p>
              )}
            </section>
          );
        })}
      </div>
      {cancelled > 0 && (
        <p className="dv-muted">
          <Link href="?view=list" className="dv-link">
            {cancelled} {dt(lang, 'cancelled_in_list')}
          </Link>
        </p>
      )}
    </>
  );
}
