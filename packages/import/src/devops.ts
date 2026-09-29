/**
 * JM DevOps' import: the "Projects Management" spreadsheet -> the devops schema.
 * Its own command (npm run import:devops), so the app stays separable (CLAUDE.md §3).
 *
 * The sheet (project-managment BUILD.md): a Config tab of projects (name, tab name,
 * prefix, GitHub repo), and one tab per project, a row per issue (id, title, type,
 * status, priority, assignee, requested by, description, created, due date, notes).
 * "Requested by" is not brought over: the app dropped it (owner, 2026-09-29).
 *
 * - Columns are found by their HEADER, never by position (RBAC §4). The old code read
 *   them by position, so the usual spellings of each header are accepted, and a
 *   missing one is a problem naming the headers that were found.
 * - Issue numbers are KEPT: CHK-066 stays 66. An ID that does not match its project's
 *   prefix, a duplicate, or a titled row with no ID (a row the sheet never stamped) is
 *   a problem. Nothing is renumbered.
 * - Type, status and priority must be one of the old app's words; anything else is a
 *   problem, not a guess. Blank rows (the old delete cleared a row) are skipped.
 * - Dates are calendar dates: a real date cell is read as Toronto wall clock (not
 *   through UTC, which is how the old API showed them a day early), text must be
 *   yyyy-mm-dd.
 * - The assignee becomes an admin's address only when the text is exactly one admin's
 *   first or full name ("Sony"); otherwise the text is kept as written. Never guessed.
 * - Notes become the issue's first comment, with no author ("Notes de la feuille").
 * - The sheet's prefix is read only to make sense of its IDs (CHK-066 is #066): the app
 *   has no prefixes (owner, 2026-09-29). A project is found again by its name.
 * - Safe to run again: projects are matched on name, issues on (project, number),
 *   the notes comment and the "imported" event are written once. One transaction.
 */

import { comments, events, issues, projects, type Db } from '@hub/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { requiredText, text, type At, type Cell, type Problem } from './cells';
import type { SheetRow, Workbook } from './workbook';

export interface DevopsIssue {
  number: number;
  title: string;
  type: 'bug' | 'feature' | 'task';
  status: 'new' | 'active' | 'completed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assigneeText: string | null;
  description: string;
  createdOn: string;
  dueDate: string | null;
  notes: string | null;
}

export interface DevopsProject {
  name: string;
  prefix: string;
  githubRepo: string | null;
  issues: DevopsIssue[];
}

/** Which header names mean which column, compared without case, spaces or punctuation. */
const CONFIG_COLS = {
  name: ['name', 'projectname', 'project'],
  tab: ['tabname', 'tab', 'sheet', 'sheetname'],
  prefix: ['prefix', 'idprefix', 'key'],
  repo: ['githubrepo', 'github', 'repo', 'repository', 'githuburl'],
} as const;
const ISSUE_COLS = {
  id: ['id', 'issueid', 'key'],
  title: ['title', 'summary'],
  type: ['type', 'issuetype'],
  status: ['status'],
  priority: ['priority'],
  assignee: ['assignee', 'assignedto'],
  description: ['description', 'details'],
  created: ['created', 'createddate', 'createdon', 'datecreated'],
  due: ['duedate', 'due', 'deadline'],
  notes: ['notes', 'note'],
} as const;
const OPTIONAL = new Set(['repo', 'description', 'due', 'notes', 'assignee']);

const squash = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Header name in the sheet for each column we need, or problems naming what was found. */
function columns<K extends string>(tab: string, rows: SheetRow[], wanted: Record<K, readonly string[]>, problems: Problem[]): Record<K, string | null> | null {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))];
  const out = {} as Record<K, string | null>;
  let ok = true;
  for (const key of Object.keys(wanted) as K[]) {
    const found = headers.find((h) => wanted[key].includes(squash(h)));
    out[key] = found ?? null;
    if (!found && !OPTIONAL.has(key)) {
      ok = false;
      problems.push({ tab, row: 1, column: key, message: `no "${key}" column; the headers found are: ${headers.join(', ') || 'none'}` });
    }
  }
  return ok ? out : null;
}

const word = <T extends string>(at: At, column: string, v: Cell | undefined, map: Record<string, T>): T => {
  const t = text(at, column, v);
  const hit = t === null ? undefined : map[squash(t)];
  if (!hit) at.problems.push({ tab: at.tab, row: at.row, column, message: t === null ? 'blank' : 'not one of the known values' });
  return hit ?? (Object.values(map)[0] as T);
};

/** A calendar date: a date cell (Toronto wall clock), or yyyy-mm-dd text. */
function day(at: At, column: string, v: Cell | undefined, required: boolean): string | null {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) {
    if (required) at.problems.push({ tab: at.tab, row: at.row, column, message: 'blank' });
    return null;
  }
  // The reader gives Toronto wall clock in the UTC fields: read them as they are.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  at.problems.push({ tab: at.tab, row: at.row, column, message: 'expected a date' });
  return null;
}

export function transformDevops(wb: Workbook): { projects: DevopsProject[]; problems: Problem[] } {
  const problems: Problem[] = [];
  const config = wb.Config;
  if (!config) return { projects: [], problems: [{ tab: 'Config', row: 0, column: '', message: 'no Config tab' }] };
  const cc = columns('Config', config, CONFIG_COLS, problems);
  if (!cc) return { projects: [], problems };

  const out: DevopsProject[] = [];
  const prefixes = new Set<string>();
  const names = new Set<string>();
  for (const r of config) {
    const at: At = { tab: 'Config', row: r.row, problems };
    const name = text(at, cc.name!, r.cells[cc.name!]);
    if (!name) continue; // the enum lists share the tab, in rows with no project
    const tab = requiredText(at, cc.tab!, r.cells[cc.tab!]);
    const prefix = (requiredText(at, cc.prefix!, r.cells[cc.prefix!]) ?? '').toUpperCase();
    const repo = cc.repo ? text(at, cc.repo, r.cells[cc.repo]) : null;
    if (!/^[A-Z]{2,6}$/.test(prefix)) problems.push({ tab: 'Config', row: r.row, column: cc.prefix!, message: 'a prefix is 2 to 6 letters' });
    if (prefixes.has(prefix)) problems.push({ tab: 'Config', row: r.row, column: cc.prefix!, message: 'prefix used twice' });
    if (names.has(name.toLowerCase())) problems.push({ tab: 'Config', row: r.row, column: cc.name!, message: 'project name used twice' });
    if (repo && !/^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?\/?$/.test(repo)) problems.push({ tab: 'Config', row: r.row, column: cc.repo!, message: 'not a https://github.com/ link' });
    prefixes.add(prefix);
    names.add(name.toLowerCase());
    // An .xlsx tab name is at most 31 characters: the download cuts longer ones
    // ("ClearviewService Library Refactor" arrives as "...Refact"). Only that exact cut.
    const rows = wb[tab] ?? (tab.length > 31 ? wb[tab.slice(0, 31)] : undefined);
    if (!rows) {
      problems.push({ tab: 'Config', row: r.row, column: cc.tab!, message: 'no tab with that name' });
      continue;
    }
    out.push({ name, prefix, githubRepo: repo ? repo.replace(/\/$/, '') : null, issues: issuesOf(tab, prefix, rows, problems) });
  }
  return { projects: out, problems };
}

function issuesOf(tab: string, prefix: string, rows: SheetRow[], problems: Problem[]): DevopsIssue[] {
  if (!rows.length) return [];
  const c = columns(tab, rows, ISSUE_COLS, problems);
  if (!c) return [];
  const seen = new Set<number>();
  const out: DevopsIssue[] = [];
  const idPattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  for (const r of rows) {
    const at: At = { tab, row: r.row, problems };
    const cell = (k: keyof typeof c) => (c[k] ? r.cells[c[k]!] : null);
    const rawId = text(at, c.id!, cell('id'));
    const title = text(at, c.title!, cell('title'));
    if (!rawId && !title) continue;
    const m = rawId ? idPattern.exec(rawId) : null;
    if (!m) {
      problems.push({ tab, row: r.row, column: c.id!, message: rawId ? `not ${prefix}-<number>` : 'blank: the sheet never gave this row an ID' });
      continue;
    }
    const number = Number(m[1]);
    if (number < 1 || seen.has(number)) {
      problems.push({ tab, row: r.row, column: c.id!, message: number < 1 ? 'number must be 1 or more' : 'ID used twice' });
      continue;
    }
    seen.add(number);
    if (!title) problems.push({ tab, row: r.row, column: c.title!, message: 'blank' });
    const assignee = c.assignee ? text(at, c.assignee, cell('assignee')) : null;
    out.push({
      number,
      title: (title ?? '').replace(/\s+/g, ' ').slice(0, 200),
      type: word(at, c.type!, cell('type'), { bug: 'bug', feature: 'feature', task: 'task' }),
      status: word(at, c.status!, cell('status'), { new: 'new', active: 'active', completed: 'completed' }),
      priority: word(at, c.priority!, cell('priority'), { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }),
      assigneeText: assignee && squash(assignee) !== 'unassigned' ? assignee : null,
      description: (c.description ? text(at, c.description, cell('description')) : null) ?? '',
      createdOn: day(at, c.created!, cell('created'), true) ?? '',
      dueDate: c.due ? day(at, c.due, cell('due'), false) : null,
      notes: c.notes ? text(at, c.notes, cell('notes')) : null,
    });
  }
  return out;
}

/**
 * An assignee's address: the admin whose first or full name is exactly the sheet's
 * text, when there is exactly one. Otherwise null, and the text is kept.
 */
export function matchAdmin(textValue: string | null, admins: readonly { email: string; fullName: string | null }[]): string | null {
  if (!textValue) return null;
  const t = squash(textValue);
  const hits = admins.filter((a) => a.fullName && (squash(a.fullName) === t || squash(a.fullName.split(/\s+/)[0]!) === t));
  return hits.length === 1 ? hits[0]!.email : null;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Writes the plan in ONE transaction. Safe to run again from the same snapshot. */
export async function loadDevops(db: Db, plan: DevopsProject[], admins: readonly { email: string; fullName: string | null }[]): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    for (const p of plan) {
      // Projects have no prefix in the app any more: the same project is the same name.
      const [had] = await tx.select({ id: projects.id }).from(projects).where(sql`lower(${projects.name}) = lower(${p.name})`);
      const pid = had
        ? (await tx.update(projects).set({ name: p.name, githubRepo: p.githubRepo }).where(eq(projects.id, had.id)).returning({ id: projects.id }))[0]!.id
        : (await tx.insert(projects).values({ name: p.name, githubRepo: p.githubRepo }).returning({ id: projects.id }))[0]!.id;
      for (const i of p.issues) {
        const email = matchAdmin(i.assigneeText, admins);
        const values = {
          projectId: pid,
          number: i.number,
          title: i.title,
          type: i.type,
          status: i.status,
          priority: i.priority,
          assigneeEmail: email,
          assigneeText: email ? null : i.assigneeText,
          description: i.description,
          dueDate: i.dueDate,
          createdOn: i.createdOn,
        };
        const [iss] = await tx
          .insert(issues)
          .values(values)
          .onConflictDoUpdate({ target: [issues.projectId, issues.number], set: { ...values, updatedAt: new Date() } })
          .returning({ id: issues.id });
        const iid = iss!.id;
        const [note] = await tx.select({ id: comments.id }).from(comments).where(and(eq(comments.issueId, iid), isNull(comments.authorEmail)));
        if (i.notes && note) await tx.update(comments).set({ body: i.notes }).where(eq(comments.id, note.id));
        else if (i.notes) await tx.insert(comments).values({ issueId: iid, authorEmail: null, body: i.notes, createdAt: new Date(`${i.createdOn}T12:00:00Z`) });
        const [had] = await tx.select({ id: events.id }).from(events).where(and(eq(events.issueId, iid), eq(events.event, 'imported')));
        if (!had) await tx.insert(events).values({ projectId: pid, issueId: iid, issueNumber: i.number, event: 'imported' });
      }
      // Past the highest number from the sheet, and never backwards.
      const top = Math.max(0, ...p.issues.map((i) => i.number));
      await tx
        .update(projects)
        .set({ nextNumber: sql`greatest(${projects.nextNumber}, ${top + 1})` })
        .where(eq(projects.id, pid));
    }
  });
}

/** Re-reads what was written and compares it with the plan, field by field. */
export async function verifyDevops(db: Db, plan: DevopsProject[], admins: readonly { email: string; fullName: string | null }[]): Promise<{ notes: string[]; failures: string[] }> {
  const notes: string[] = [];
  const failures: string[] = [];
  const rows = plan.length ? await db.select().from(projects) : [];
  let issuesChecked = 0;
  for (const p of plan) {
    const r = rows.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (!r) {
      failures.push(`project ${p.prefix} is missing`);
      continue;
    }
    if (r.name !== p.name || (r.githubRepo ?? null) !== p.githubRepo) failures.push(`project ${p.prefix}: name or link differs`);
    const top = Math.max(0, ...p.issues.map((i) => i.number));
    if (r.nextNumber <= top) failures.push(`project ${p.prefix}: next number ${r.nextNumber} is not past ${top}`);
    const got = new Map((await db.select().from(issues).where(eq(issues.projectId, r.id))).map((i) => [i.number, i]));
    for (const i of p.issues) {
      const g = got.get(i.number);
      const email = matchAdmin(i.assigneeText, admins);
      if (!g) {
        failures.push(`${p.prefix}-${i.number} is missing`);
        continue;
      }
      const same =
        g.title === i.title &&
        g.type === i.type &&
        g.status === i.status &&
        g.priority === i.priority &&
        (g.assigneeEmail ?? null) === email &&
        (g.assigneeText ?? null) === (email ? null : i.assigneeText) &&
        g.description === i.description &&
        g.createdOn === i.createdOn &&
        (g.dueDate ?? null) === i.dueDate;
      if (!same) failures.push(`${p.prefix}-${i.number} differs from the sheet`);
      issuesChecked++;
    }
  }
  notes.push(`${plan.length} projects and ${issuesChecked} issues match the sheet, field by field`);
  notes.push('every project numbers new issues past its highest imported number');
  return { notes, failures };
}
