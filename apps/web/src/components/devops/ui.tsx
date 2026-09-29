import { dt, type DevopsKey } from '@/lib/devops/i18n';
import { issueKey, projectHue, type IssuePriority, type IssueStatus, type IssueType } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';

/** Shared bits of JM DevOps' pages. No state: usable from server and client alike. */

export function TypeBadge({ lang, type }: { lang: Lang; type: IssueType }) {
  return <span className={`dv-badge dv-type-${type}`}>{dt(lang, `type_${type}`)}</span>;
}

export function PriorityBadge({ lang, priority }: { lang: Lang; priority: IssuePriority }) {
  return <span className={`dv-badge dv-pri-${priority}`}>{dt(lang, `priority_${priority}`)}</span>;
}

/** A dot AND the word: status never by colour alone. */
export function StatusTag({ lang, status }: { lang: Lang; status: IssueStatus }) {
  return (
    <span className="dv-status">
      <span className={`dv-sdot dv-s-${status}`} aria-hidden="true" />
      {dt(lang, `status_${status}`)}
    </span>
  );
}

export function Key({ prefix, number }: { prefix: string; number: number }) {
  return <span className="dv-key">{issueKey(prefix, number)}</span>;
}

/** A project's square with its initials, in its own colour (the old Dashboard cards). */
export function ProjectMark({ prefix, name, size = 40 }: { prefix: string; name: string; size?: number }) {
  const h = projectHue(prefix);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || prefix.slice(0, 2);
  return (
    <span className="dv-pmark" style={{ width: size, height: size, background: `hsl(${h} 70% 93%)`, color: `hsl(${h} 58% 32%)` }} aria-hidden="true">
      {initials}
    </span>
  );
}

const OUTCOME: Record<string, DevopsKey> = {
  changed: 'out_changed',
  invalid: 'out_invalid',
  archived: 'out_archived',
  not_found: 'out_not_found',
  prefix_taken: 'out_prefix_taken',
  name_taken: 'out_name_taken',
  denied: 'out_denied',
  expired: 'out_expired',
  error: 'out_error',
};

/** What to tell someone after an action that did not simply work; null when it did. */
export function outcomeText(lang: Lang, outcome: string): string | null {
  if (outcome === 'done' || outcome === 'unchanged') return null;
  return dt(lang, OUTCOME[outcome] ?? 'out_error');
}

/** A colon as each language writes it: French puts a non-breaking space before. */
export const colon = (lang: Lang) => (lang === 'fr' ? '\u00a0: ' : ': ');

/** A date for display, from yyyy-mm-dd, in the reader's language. */
export function showDate(lang: Lang, iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A moment for display, in Toronto. */
export function showWhen(lang: Lang, at: Date): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(at);
}
