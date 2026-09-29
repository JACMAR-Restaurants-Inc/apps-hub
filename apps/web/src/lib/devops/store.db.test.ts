/**
 * JM DevOps' writes against REAL Postgres (staging). Each test runs in a transaction
 * that is always rolled back, except the race, which needs two connections and cleans
 * up after itself. Skipped in CI.
 */

import { existsSync } from 'node:fs';
import { comments, createDb, events, issues, projects } from '@hub/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { addComment, createIssue, createProject, deleteIssue, issueByKey, listProjects, setProjectArchived, updateIssue, updateProject, type Conn } from './store';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});
class Rollback extends Error {}
async function rolledBack(fn: (tx: Conn) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const ME = 'admin-test@example.invalid';
const OTHER = 'other-admin@example.invalid';
const ADMINS = new Set([ME, OTHER]);
const TODAY = '2026-09-29';
const blank = { title: 'x', type: 'task', status: 'new', priority: 'medium', assignee: '', requestedBy: '', description: '', dueDate: '' };

async function project(tx: Conn, prefix = 'ZZT', name = 'Test project') {
  expect((await createProject(tx, ME, { name, prefix, repo: '' })).outcome).toBe('done');
  const [p] = await tx.select().from(projects).where(eq(projects.prefix, prefix));
  return p.id;
}
async function issue(tx: Conn, projectId: number, title = 'An issue') {
  const out = await createIssue(tx, ME, projectId, { ...blank, title }, ADMINS, TODAY);
  expect(out.outcome).toBe('done');
  const [i] = await tx.select().from(issues).where(and(eq(issues.projectId, projectId), eq(issues.number, out.number!)));
  return i;
}
const history = (tx: Conn, issueId: number) =>
  tx.select({ event: events.event, before: events.before, after: events.after, actor: events.actorEmail }).from(events).where(eq(events.issueId, issueId)).orderBy(asc(events.id));

describe.skipIf(!db)('JM DevOps on Postgres (rolled back)', () => {
  it('projects: prefix and name unique (name whatever its case), prefix never edited', async () => {
    await rolledBack(async (tx) => {
      const id = await project(tx);
      expect((await createProject(tx, ME, { name: 'Other', prefix: 'zzt', repo: '' })).outcome).toBe('prefix_taken');
      expect((await createProject(tx, ME, { name: 'TEST PROJECT', prefix: 'ZZU', repo: '' })).outcome).toBe('name_taken');
      expect((await createProject(tx, ME, { name: 'Bad', prefix: 'Z1', repo: '' })).outcome).toBe('invalid');

      expect(await updateProject(tx, ME, id, { name: 'Wrong', repo: '' }, { name: 'Renamed', repo: '' })).toBe('changed');
      expect(await updateProject(tx, ME, id, { name: 'Test project', repo: '' }, { name: 'Renamed', repo: 'https://github.com/a/b' })).toBe('done');
      const [p] = await tx.select().from(projects).where(eq(projects.id, id));
      expect([p.name, p.prefix, p.githubRepo]).toEqual(['Renamed', 'ZZT', 'https://github.com/a/b']);
      const log = await tx.select({ event: events.event, before: events.before, after: events.after }).from(events).where(eq(events.projectId, id)).orderBy(asc(events.id));
      expect(log).toEqual([
        { event: 'project_created', before: null, after: 'ZZT · Test project' },
        { event: 'project_name', before: 'Test project', after: 'Renamed' },
        { event: 'project_repo', before: null, after: 'https://github.com/a/b' },
      ]);
    });
  });

  it('numbers: one after another, never reused after a delete', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const a = await issue(tx, pid, 'first');
      const b = await issue(tx, pid, 'second');
      expect([a.number, b.number]).toEqual([1, 2]);
      expect(await deleteIssue(tx, ME, b.id, 'ZZT-002')).toBe('done');
      expect((await issue(tx, pid, 'third')).number).toBe(3);
    });
  });

  it('a new issue records who created it and when, in Toronto', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const i = await issue(tx, pid);
      expect([i.createdBy, i.createdOn, i.status, i.type, i.priority]).toEqual([ME, TODAY, 'new', 'task', 'medium']);
      expect(await history(tx, i.id)).toEqual([{ event: 'created', before: null, after: 'An issue', actor: ME }]);
      // Only New or Active at creation; only an admin as assignee.
      expect((await createIssue(tx, ME, pid, { ...blank, status: 'cancelled' }, ADMINS, TODAY)).outcome).toBe('invalid');
      expect((await createIssue(tx, ME, pid, { ...blank, assignee: 'stranger@example.invalid' }, ADMINS, TODAY)).outcome).toBe('invalid');
    });
  });

  it('a field saves only from what the page showed, with its history', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const i = await issue(tx, pid);
      expect(await updateIssue(tx, ME, i.id, 'priority', 'medium', 'high', ADMINS)).toBe('done');
      // The other admin's page still shows medium: their save must not undo mine.
      expect(await updateIssue(tx, OTHER, i.id, 'priority', 'medium', 'low', ADMINS)).toBe('changed');
      expect(await updateIssue(tx, ME, i.id, 'priority', 'high', 'high', ADMINS)).toBe('unchanged');
      expect(await updateIssue(tx, ME, i.id, 'assignee', '', OTHER, ADMINS)).toBe('done');
      expect(await updateIssue(tx, ME, i.id, 'assignee', OTHER, 'stranger@example.invalid', ADMINS)).toBe('invalid');
      expect(await updateIssue(tx, ME, i.id, 'dueDate', '', '2026-10-08', ADMINS)).toBe('done');
      expect(await updateIssue(tx, ME, i.id, 'title', 'An issue', '   ', ADMINS)).toBe('invalid');
      expect((await history(tx, i.id)).slice(1)).toEqual([
        { event: 'priority', before: 'medium', after: 'high', actor: ME },
        { event: 'assignee', before: null, after: OTHER, actor: ME },
        { event: 'dueDate', before: null, after: '2026-10-08', actor: ME },
      ]);
    });
  });

  it('cancelling needs a reason; leaving Cancelled clears it', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const i = await issue(tx, pid);
      expect(await updateIssue(tx, ME, i.id, 'status', 'new', 'cancelled', ADMINS)).toBe('invalid');
      expect(await updateIssue(tx, ME, i.id, 'status', 'new', 'cancelled', ADMINS, '  ')).toBe('invalid');
      expect(await updateIssue(tx, ME, i.id, 'status', 'new', 'cancelled', ADMINS, 'Duplicate of ZZT-001')).toBe('done');
      let [row] = await tx.select().from(issues).where(eq(issues.id, i.id));
      expect([row.status, row.cancelReason]).toEqual(['cancelled', 'Duplicate of ZZT-001']);
      expect(await updateIssue(tx, ME, i.id, 'status', 'cancelled', 'active', ADMINS)).toBe('done');
      [row] = await tx.select().from(issues).where(eq(issues.id, i.id));
      expect([row.status, row.cancelReason]).toEqual(['active', null]);
    });
  });

  it('delete: only with its key; history and a full copy stay under the project', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const i = await issue(tx, pid, 'To delete');
      expect(await addComment(tx, ME, i.id, 'A note')).toBe('done');
      expect(await updateIssue(tx, ME, i.id, 'priority', 'medium', 'high', ADMINS)).toBe('done');

      expect(await deleteIssue(tx, ME, i.id, 'ZZT-002')).toBe('invalid');
      expect(await deleteIssue(tx, ME, i.id, '')).toBe('invalid');
      expect(await deleteIssue(tx, ME, i.id, 'zzt-001')).toBe('done');

      expect(await issueByKey(tx, 'ZZT', 1)).toBeNull();
      expect(await tx.select().from(comments).where(eq(comments.issueId, i.id))).toEqual([]);
      const kept = await tx
        .select({ event: events.event, issueId: events.issueId, number: events.issueNumber, detail: events.detail })
        .from(events)
        .where(and(eq(events.projectId, pid), eq(events.issueNumber, 1)))
        .orderBy(asc(events.id));
      expect(kept.map((e) => [e.event, e.issueId, e.number])).toEqual([
        ['created', null, 1],
        ['priority', null, 1],
        ['deleted', null, 1],
      ]);
      const copy = kept[2].detail as { issue: { title: string; priority: string }; comments: { body: string; authorEmail: string }[] };
      expect(copy.issue).toMatchObject({ title: 'To delete', priority: 'high' });
      expect(copy.comments.map((c) => [c.body, c.authorEmail])).toEqual([['A note', ME]]);
    });
  });

  it('an archived project is read only, and can come back', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const i = await issue(tx, pid);
      expect(await setProjectArchived(tx, ME, pid, true)).toBe('done');
      expect(await setProjectArchived(tx, ME, pid, true)).toBe('unchanged');
      expect((await createIssue(tx, ME, pid, blank, ADMINS, TODAY)).outcome).toBe('archived');
      expect(await updateIssue(tx, ME, i.id, 'priority', 'medium', 'high', ADMINS)).toBe('archived');
      expect(await addComment(tx, ME, i.id, 'x')).toBe('archived');
      expect(await deleteIssue(tx, ME, i.id, 'ZZT-001')).toBe('archived');
      expect(await updateProject(tx, ME, pid, { name: 'Test project', repo: '' }, { name: 'New', repo: '' })).toBe('archived');
      expect(await setProjectArchived(tx, ME, pid, false)).toBe('done');
      expect(await updateIssue(tx, ME, i.id, 'priority', 'medium', 'high', ADMINS)).toBe('done');
    });
  });

  it('project counts: by status, overdue only when open', async () => {
    await rolledBack(async (tx) => {
      const pid = await project(tx);
      const a = await issue(tx, pid);
      const b = await issue(tx, pid);
      await issue(tx, pid);
      await updateIssue(tx, ME, a.id, 'dueDate', '', '2026-09-01', ADMINS);
      await updateIssue(tx, ME, b.id, 'dueDate', '', '2026-09-01', ADMINS);
      await updateIssue(tx, ME, b.id, 'status', 'new', 'completed', ADMINS);
      const p = (await listProjects(tx, TODAY)).find((x) => x.id === pid)!;
      expect(p.counts).toEqual({ total: 3, new: 2, active: 0, completed: 1, cancelled: 0, overdue: 1 });
    });
  });

  it('two people creating at the same moment never get the same number', async () => {
    // Needs two connections, so it cannot be rolled back: it removes what it made.
    const prefix = 'ZZRACE';
    const clean = async () => {
      const [p] = await db!.select({ id: projects.id }).from(projects).where(eq(projects.prefix, prefix));
      if (!p) return;
      await db!.delete(events).where(eq(events.projectId, p.id));
      await db!.execute(sql`delete from devops.comments where issue_id in (select id from devops.issues where project_id = ${p.id})`);
      await db!.delete(issues).where(eq(issues.projectId, p.id));
      await db!.delete(projects).where(eq(projects.id, p.id));
    };
    const other = createDb(url!);
    try {
      await clean();
      expect((await createProject(db!, ME, { name: 'Race test', prefix, repo: '' })).outcome).toBe('done');
      const [p] = await db!.select({ id: projects.id }).from(projects).where(eq(projects.prefix, prefix));
      const made = await Promise.all(
        Array.from({ length: 10 }, (_, k) => createIssue(k % 2 ? other : db!, ME, p.id, { ...blank, title: `race ${k}` }, ADMINS, TODAY)),
      );
      expect(made.map((m) => m.outcome)).toEqual(Array(10).fill('done'));
      expect(made.map((m) => m.number).sort((x, y) => x! - y!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    } finally {
      await clean();
      await other.$client.end();
    }
  });
});
