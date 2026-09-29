/**
 * JM DevOps' rules, with no database: the vocabularies, what a valid value is, issue
 * keys, overdue, counts and filters. Everything a page or action accepts from a
 * browser goes through here first.
 */

/** The app key: the catalogue's and the roster's name for JM DevOps. */
export const DEVOPS_APP = 'Projects';

export const TYPES = ['bug', 'feature', 'task'] as const;
/**
 * The old app's three, plus "cancelled" (owner agreed, 2026-09-29): a refused request
 * marked Completed is a lie in the counts, and one left New is never closed.
 */
export const STATUSES = ['new', 'active', 'completed', 'cancelled'] as const;
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
/** The board's columns. Cancelled issues are listed, not boarded. */
export const BOARD_STATUSES = ['new', 'active', 'completed'] as const;

export type IssueType = (typeof TYPES)[number];
export type IssueStatus = (typeof STATUSES)[number];
export type IssuePriority = (typeof PRIORITIES)[number];

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (list as readonly string[]).includes(v);
export const isType = oneOf(TYPES);
export const isStatus = oneOf(STATUSES);
export const isPriority = oneOf(PRIORITIES);

export const MAX_TITLE = 200;
export const MAX_TEXT = 20_000;
export const MAX_REASON = 500;
export const MAX_NAME = 80;

/** Text a person typed: control characters out (newlines kept where asked), trimmed. */
export function cleanText(v: unknown, max: number, multiline = false): string | null {
  if (typeof v !== 'string') return null;
  const s = (multiline ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '') : v.replace(/[\u0000-\u001f\u007f]/g, ' ')).trim();
  return s.length <= max ? s : null;
}

/** A title: required, one line. */
export function cleanTitle(v: unknown): string | null {
  const s = cleanText(v, MAX_TITLE);
  return s ? s.replace(/\s+/g, ' ') : null;
}

/** A project's GitHub link: empty, or an https://github.com/ address. The old app took anything. */
export function cleanRepo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return '';
  return /^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?\/?$/.test(s) && s.length <= 200 ? s.replace(/\/$/, '') : null;
}

/** A calendar date, yyyy-mm-dd, that exists; '' for none. */
export function cleanDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2100 && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d ? s : null;
}

/**
 * An issue as people see it: #066, three digits at least, as the old app wrote its
 * numbers. Projects have no prefix any more (owner, 2026-09-29).
 */
export const issueKey = (n: number) => `#${String(n).padStart(3, '0')}`;

/** What someone typed for an issue's number ("66", "#066") to the number, or null. */
export function parseNumber(v: string): number | null {
  const m = /^#?0*(\d{1,6})$/.exec(v.trim());
  const n = m ? Number(m[1]) : 0;
  return n >= 1 ? n : null;
}

/**
 * Overdue: has a due date before today, and is still open. `today` is Toronto's date
 * from the server (businessDate), never the browser's.
 */
export function isOverdue(i: { dueDate: string | null; status: IssueStatus }, today: string): boolean {
  return !!i.dueDate && (i.status === 'new' || i.status === 'active') && i.dueDate < today;
}

export interface Counts {
  total: number;
  new: number;
  active: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

export function countIssues(list: readonly { status: IssueStatus; dueDate: string | null }[], today: string): Counts {
  const c: Counts = { total: 0, new: 0, active: 0, completed: 0, cancelled: 0, overdue: 0 };
  for (const i of list) {
    c.total++;
    c[i.status]++;
    if (isOverdue(i, today)) c.overdue++;
  }
  return c;
}

/**
 * Done, out of the work that is still meant to happen: cancelled issues are neither
 * done nor outstanding, so they count on neither side.
 */
export function completion(c: Counts): number {
  const meant = c.total - c.cancelled;
  return meant ? Math.round((c.completed / meant) * 100) : 0;
}

export interface Filters {
  q: string;
  type: IssueType | '';
  priority: IssuePriority | '';
  /** An address, 'none' for unassigned, or '' for everyone. */
  assignee: string;
}

/** Filters from a page's search params: anything unrecognised is simply no filter. */
export function parseFilters(p: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const type = one('type');
  const priority = one('priority');
  return {
    q: (cleanText(one('q'), 100) ?? '').slice(0, 100),
    type: isType(type) ? type : '',
    priority: isPriority(priority) ? priority : '',
    assignee: /^[^\s]{1,254}$/.test(one('assignee')) ? one('assignee').toLowerCase() : '',
  };
}

export interface FilterableIssue {
  number: number;
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
  assigneeEmail: string | null;
  assigneeText: string | null;
}

/** Search matches the number (#066 or 66), the title and the description; the old app skipped the description. */
export function matches(i: FilterableIssue, f: Filters): boolean {
  if (f.type && i.type !== f.type) return false;
  if (f.priority && i.priority !== f.priority) return false;
  if (f.assignee === 'none' ? i.assigneeEmail || i.assigneeText : f.assignee && i.assigneeEmail !== f.assignee) return false;
  if (!f.q) return true;
  const q = f.q.toLowerCase();
  return issueKey(i.number).includes(q) || String(i.number) === q.replace(/^#/, '') || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
}

/**
 * A project's colour, from its id, which never changes. Each id turns the hue by the
 * golden angle (137.5°), so projects made one after another get clearly different
 * colours. It used to hash the prefix (the old app's colors.ts); hashing ids, which
 * are neighbours, gave nearly the same colour to every project.
 */
export function projectHue(id: number): number {
  return Math.round((id * 137.508) % 360);
}
