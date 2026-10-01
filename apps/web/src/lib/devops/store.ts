/**
 * JM DevOps' reads and writes. The caller has already passed requireSystemAdmin():
 * this checks the VALUES, never who is asking.
 *
 * - Every write is one transaction. Changing an issue or project first locks its row
 *   and checks the value is still what the page showed, or answers 'changed' (the
 *   portal's admin writes do the same, CLAUDE.md §3): with two people on one issue,
 *   the second save must not silently undo the first.
 * - Every change is an event: who, when, before and after. The sheet kept none.
 * - A new issue takes its project's next number under that project's row lock, so a
 *   number is never given twice, nor reused after a delete (the old nextId was max+1).
 * - A project can be deleted completely (owner, 2026-09-29), by typing its exact name
 *   (the old DeleteProjectModal): its issues, comments and history go with it.
 */

import { comments, events, issues, projects, type Db } from '@hub/db';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  MAX_NAME,
  MAX_REASON,
  MAX_TEXT,
  cleanDate,
  cleanRepo,
  cleanText,
  cleanTitle,
  parseNumber,
  isPriority,
  isStatus,
  isType,
  type Counts,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from './rules';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Conn = Db | Tx;

export type Outcome = 'done' | 'unchanged' | 'changed' | 'invalid' | 'not_found' | 'name_taken';

export interface ProjectRow {
  id: number;
  name: string;
  githubRepo: string | null;
}

export interface IssueRow {
  id: number;
  projectId: number;
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  cancelReason: string | null;
  priority: IssuePriority;
  assigneeEmail: string | null;
  assigneeText: string | null;
  description: string;
  dueDate: string | null;
  createdOn: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const projectCols = { id: projects.id, name: projects.name, githubRepo: projects.githubRepo };

async function inTx<T>(db: Conn, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}
const uniqueViolation = (e: unknown): string | null => {
  const err = (e as { cause?: { code?: string; constraint?: string }; code?: string; constraint?: string }) ?? {};
  const c = err.code === '23505' ? err : err.cause?.code === '23505' ? err.cause : null;
  return c ? (c.constraint ?? '') : null;
};

// ---------------------------------------------------------------- reads

/** Every project, by name, each with its counts. */
export async function listProjects(db: Conn, today: string): Promise<(ProjectRow & { counts: Counts })[]> {
  const [rows, tallies] = await Promise.all([
    db.select(projectCols).from(projects).orderBy(sql`lower(${projects.name})`),
    db
      .select({
        projectId: issues.projectId,
        status: issues.status,
        n: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${issues.dueDate} < ${today} and ${issues.status} in ('new', 'active'))::int`,
      })
      .from(issues)
      .groupBy(issues.projectId, issues.status),
  ]);
  const counts = new Map<number, Counts>(rows.map((p) => [p.id, { total: 0, new: 0, active: 0, completed: 0, cancelled: 0, overdue: 0 }]));
  for (const t of tallies) {
    const c = counts.get(t.projectId);
    if (!c) continue;
    c[t.status] += t.n;
    c.total += t.n;
    c.overdue += t.overdue;
  }
  return rows.map((p) => ({ ...p, counts: counts.get(p.id)! }));
}

/** The sidebar: every project, id and name, by name ignoring case. */
export async function sidebarProjects(db: Conn): Promise<{ id: number; name: string }[]> {
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(sql`lower(${projects.name})`);
}

export async function projectById(db: Conn, id: number): Promise<ProjectRow | null> {
  if (!Number.isSafeInteger(id)) return null;
  return (await db.select(projectCols).from(projects).where(eq(projects.id, id)))[0] ?? null;
}

/** A project's issues, newest first. A few hundred at most: the page filters them. */
export async function listIssues(db: Conn, projectId: number): Promise<IssueRow[]> {
  return db.select().from(issues).where(eq(issues.projectId, projectId)).orderBy(desc(issues.number));
}

/** An issue by its project and number (/devops/3/66). */
export async function issueByNumber(db: Conn, projectId: number, number: number): Promise<{ project: ProjectRow; issue: IssueRow } | null> {
  const project = await projectById(db, projectId);
  if (!project || !Number.isSafeInteger(number)) return null;
  const issue = (await db.select().from(issues).where(and(eq(issues.projectId, project.id), eq(issues.number, number))))[0];
  return issue ? { project, issue } : null;
}

export interface CommentRow {
  id: number;
  authorEmail: string | null;
  body: string;
  createdAt: Date;
}
export interface EventRow {
  id: number;
  actorEmail: string | null;
  event: string;
  before: string | null;
  after: string | null;
  detail: unknown;
  at: Date;
}

/** An issue's comments (oldest first) and history (oldest first). */
export async function issueThread(db: Conn, issueId: number): Promise<{ comments: CommentRow[]; events: EventRow[] }> {
  const [c, e] = await Promise.all([
    db.select({ id: comments.id, authorEmail: comments.authorEmail, body: comments.body, createdAt: comments.createdAt }).from(comments).where(eq(comments.issueId, issueId)).orderBy(asc(comments.id)),
    db
      .select({ id: events.id, actorEmail: events.actorEmail, event: events.event, before: events.before, after: events.after, detail: events.detail, at: events.at })
      .from(events)
      .where(eq(events.issueId, issueId))
      .orderBy(asc(events.id)),
  ]);
  return { comments: c, events: e };
}

/** Issues deleted from a project: what was deleted, by whom, when. */
export async function deletedIssues(db: Conn, projectId: number) {
  return db
    .select({ number: events.issueNumber, actorEmail: events.actorEmail, detail: events.detail, at: events.at })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.event, 'deleted'), isNull(events.issueId)))
    .orderBy(desc(events.id));
}

// ------------------------------------------------------------- projects

export interface ProjectInput {
  name: unknown;
  repo: unknown;
}

/** A new project: a name (unique, whatever its case) and an optional GitHub link. */
export async function createProject(db: Conn, actor: string, raw: ProjectInput): Promise<{ outcome: Outcome; id?: number }> {
  const name = cleanText(raw.name, MAX_NAME);
  const repo = cleanRepo(raw.repo);
  if (!name || repo === null) return { outcome: 'invalid' };
  try {
    return await inTx(db, async (tx) => {
      const clash = await tx.select({ id: projects.id }).from(projects).where(sql`lower(${projects.name}) = lower(${name})`);
      if (clash.length) return { outcome: 'name_taken' as const };
      const [p] = await tx.insert(projects).values({ name, githubRepo: repo || null, createdBy: actor }).returning({ id: projects.id });
      await tx.insert(events).values({ projectId: p.id, actorEmail: actor, event: 'project_created', after: name });
      return { outcome: 'done' as const, id: p.id };
    });
  } catch (e) {
    if (uniqueViolation(e) === 'projects_name_key') return { outcome: 'name_taken' };
    throw e;
  }
}

/** Name and GitHub link. */
export async function updateProject(
  db: Conn,
  actor: string,
  id: number,
  shown: { name: unknown; repo: unknown },
  next: { name: unknown; repo: unknown },
): Promise<Outcome> {
  const name = cleanText(next.name, MAX_NAME);
  const repo = cleanRepo(next.repo);
  if (!Number.isSafeInteger(id) || !name || repo === null || typeof shown.name !== 'string' || typeof shown.repo !== 'string') return 'invalid';
  try {
    return await inTx(db, async (tx) => {
      const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
      if (!p) return 'not_found';
      if (p.name !== shown.name || (p.githubRepo ?? '') !== shown.repo) return 'changed';
      if (p.name === name && (p.githubRepo ?? '') === repo) return 'unchanged';
      if (name.toLowerCase() !== p.name.toLowerCase()) {
        const taken = await tx.select({ id: projects.id }).from(projects).where(sql`lower(${projects.name}) = lower(${name}) and ${projects.id} <> ${id}`);
        if (taken.length) return 'name_taken';
      }
      await tx.update(projects).set({ name, githubRepo: repo || null }).where(eq(projects.id, id));
      if (p.name !== name) await tx.insert(events).values({ projectId: id, actorEmail: actor, event: 'project_name', before: p.name, after: name });
      if ((p.githubRepo ?? '') !== repo) await tx.insert(events).values({ projectId: id, actorEmail: actor, event: 'project_repo', before: p.githubRepo, after: repo || null });
      return 'done';
    });
  } catch (e) {
    if (uniqueViolation(e) === 'projects_name_key') return 'name_taken';
    throw e;
  }
}

/**
 * Delete a project completely (owner, 2026-09-29; the old app did the same):
 * `confirm` must be its exact name, as the dialog asks for it, so a stray call cannot
 * delete the wrong one. Its issues, their comments and its whole history go with it,
 * in one transaction, children first (there are no cascades, CLAUDE.md §3). Nothing
 * of it is kept.
 */
export async function deleteProject(db: Conn, id: number, confirm: unknown): Promise<Outcome> {
  if (!Number.isSafeInteger(id) || typeof confirm !== 'string') return 'invalid';
  return inTx(db, async (tx) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
    if (!p) return 'not_found';
    if (confirm.trim() !== p.name) return 'invalid';
    const ids = (await tx.select({ id: issues.id }).from(issues).where(eq(issues.projectId, id))).map((i) => i.id);
    await tx.delete(events).where(eq(events.projectId, id));
    if (ids.length) await tx.delete(comments).where(inArray(comments.issueId, ids));
    await tx.delete(issues).where(eq(issues.projectId, id));
    await tx.delete(projects).where(eq(projects.id, id));
    return 'done';
  });
}

// --------------------------------------------------------------- issues

export interface IssueInput {
  title: unknown;
  type: unknown;
  status: unknown;
  priority: unknown;
  assignee: unknown;
  description: unknown;
  dueDate: unknown;
}

/** An assignee as the page shows it and sends it back: an address, '~' + the sheet's text, or ''. */
export const assigneeValue = (i: Pick<IssueRow, 'assigneeEmail' | 'assigneeText'>) => i.assigneeEmail ?? (i.assigneeText ? `~${i.assigneeText}` : '');

/** '' or one of the admins. Anything else is refused. */
function cleanAssignee(v: unknown, admins: ReadonlySet<string>): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return !e || admins.has(e) ? e : null;
}

/**
 * A new issue. `today` is Toronto's date from the server. A new issue is New or
 * Active; Completed and Cancelled are reached by changing it, so a cancel always has
 * its reason.
 */
export async function createIssue(
  db: Conn,
  actor: string,
  projectId: number,
  raw: IssueInput,
  admins: ReadonlySet<string>,
  today: string,
): Promise<{ outcome: Outcome; number?: number }> {
  const title = cleanTitle(raw.title);
  const type = raw.type ?? 'task';
  const status = raw.status ?? 'new';
  const priority = raw.priority ?? 'medium';
  const assignee = cleanAssignee(raw.assignee ?? '', admins);
  const description = cleanText(raw.description ?? '', MAX_TEXT, true);
  const dueDate = cleanDate(raw.dueDate ?? '');
  if (
    !Number.isSafeInteger(projectId) ||
    !title ||
    !isType(type) ||
    !(status === 'new' || status === 'active') ||
    !isPriority(priority) ||
    assignee === null ||
    description === null ||
    dueDate === null
  ) {
    return { outcome: 'invalid' };
  }
  return inTx(db, async (tx) => {
    // Locked: two new issues take numbers one after the other, and a project being
    // deleted cannot gain one meanwhile.
    const [p] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for('update');
    if (!p) return { outcome: 'not_found' as const };
    const [{ number }] = await tx
      .update(projects)
      .set({ nextNumber: sql`${projects.nextNumber} + 1` })
      .where(eq(projects.id, projectId))
      .returning({ number: sql<number>`${projects.nextNumber} - 1` });
    const [i] = await tx
      .insert(issues)
      .values({
        projectId,
        number,
        title,
        type,
        status,
        priority,
        assigneeEmail: assignee || null,
        description,
        dueDate: dueDate || null,
        createdOn: today,
        createdBy: actor,
      })
      .returning({ id: issues.id });
    await tx.insert(events).values({ projectId, issueId: i.id, issueNumber: number, actorEmail: actor, event: 'created', after: title });
    return { outcome: 'done' as const, number };
  });
}

export const FIELDS = ['title', 'type', 'status', 'priority', 'assignee', 'description', 'dueDate'] as const;
export type Field = (typeof FIELDS)[number];
export const isField = (v: unknown): v is Field => typeof v === 'string' && (FIELDS as readonly string[]).includes(v);

/** A field as the page shows it: what `shown` must equal. */
export function fieldValue(i: IssueRow, field: Field): string {
  switch (field) {
    case 'assignee':
      return assigneeValue(i);
    case 'dueDate':
      return i.dueDate ?? '';
    default:
      return i[field];
  }
}

/**
 * One field of an issue, as the page saves it: each field on its own, the moment it
 * changes (the old IssueModal). `shown` is the value the page had; if the issue no
 * longer has it, nothing is written and the answer is 'changed'. Cancelling needs a
 * reason; leaving Cancelled clears it.
 */
export async function updateIssue(
  db: Conn,
  actor: string,
  issueId: number,
  field: unknown,
  shown: unknown,
  next: unknown,
  admins: ReadonlySet<string>,
  reason?: unknown,
): Promise<Outcome> {
  if (!Number.isSafeInteger(issueId) || !isField(field) || typeof shown !== 'string') return 'invalid';

  let set: Partial<typeof issues.$inferInsert>;
  let after: string;
  let cancelReason: string | null = null;
  switch (field) {
    case 'title': {
      const v = cleanTitle(next);
      if (!v) return 'invalid';
      [set, after] = [{ title: v }, v];
      break;
    }
    case 'type':
    case 'priority': {
      if (!(field === 'type' ? isType(next) : isPriority(next))) return 'invalid';
      [set, after] = [{ [field]: next }, next as string];
      break;
    }
    case 'status': {
      if (!isStatus(next)) return 'invalid';
      if (next === 'cancelled') {
        cancelReason = cleanText(reason, MAX_REASON);
        if (!cancelReason) return 'invalid';
      }
      [set, after] = [{ status: next, cancelReason }, next];
      break;
    }
    case 'assignee': {
      const v = cleanAssignee(next, admins);
      if (v === null) return 'invalid';
      [set, after] = [{ assigneeEmail: v || null, assigneeText: null }, v];
      break;
    }
    case 'description': {
      const v = cleanText(next, MAX_TEXT, true);
      if (v === null) return 'invalid';
      [set, after] = [{ description: v }, v];
      break;
    }
    case 'dueDate': {
      const v = cleanDate(next);
      if (v === null) return 'invalid';
      [set, after] = [{ dueDate: v || null }, v];
      break;
    }
  }

  return inTx(db, async (tx) => {
    const [i] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
    if (!i) return 'not_found';
    const before = fieldValue(i, field);
    if (before !== shown) return 'changed';
    if (before === after) return 'unchanged';
    await tx
      .update(issues)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
    await tx.insert(events).values({
      projectId: i.projectId,
      issueId,
      issueNumber: i.number,
      actorEmail: actor,
      event: field,
      before: before || null,
      after: after || null,
      detail: cancelReason ? { reason: cancelReason } : null,
    });
    return 'done';
  });
}

export async function addComment(db: Conn, actor: string, issueId: number, body: unknown): Promise<Outcome> {
  const text = cleanText(body, MAX_TEXT, true);
  if (!Number.isSafeInteger(issueId) || !text) return 'invalid';
  return inTx(db, async (tx) => {
    const [i] = await tx.select({ projectId: issues.projectId }).from(issues).where(eq(issues.id, issueId)).for('update');
    if (!i) return 'not_found';
    await tx.insert(comments).values({ issueId, authorEmail: actor, body: text });
    return 'done';
  });
}

/**
 * Delete an issue (owner's call, 2026-09-29). `confirm` must be its number (66 or #066),
 * as the dialog sends it, so a stray call cannot delete the wrong one. Its number is not
 * given out again. Its history stays under the project and number, and a `deleted`
 * event keeps a full copy of the issue and its comments.
 */
export async function deleteIssue(db: Conn, actor: string, issueId: number, confirm: unknown): Promise<Outcome> {
  if (!Number.isSafeInteger(issueId) || typeof confirm !== 'string') return 'invalid';
  return inTx(db, async (tx) => {
    const [i] = await tx.select().from(issues).where(eq(issues.id, issueId)).for('update');
    if (!i) return 'not_found';
    if (parseNumber(confirm) !== i.number) return 'invalid';
    const thread = await tx.select().from(comments).where(eq(comments.issueId, issueId)).orderBy(asc(comments.id));
    await tx.update(events).set({ issueId: null }).where(eq(events.issueId, issueId));
    if (thread.length) await tx.delete(comments).where(inArray(comments.id, thread.map((c) => c.id)));
    await tx.delete(issues).where(eq(issues.id, issueId));
    await tx.insert(events).values({
      projectId: i.projectId,
      issueNumber: i.number,
      actorEmail: actor,
      event: 'deleted',
      before: i.title,
      detail: { issue: i, comments: thread },
    });
    return 'done';
  });
}
