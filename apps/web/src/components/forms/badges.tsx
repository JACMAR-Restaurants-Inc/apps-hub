import { ft } from '@/lib/forms/i18n';
import type { Lang } from '@/lib/i18n';

/**
 * Where a form stands, as badges (owner, 2026-10-13: forms improved over and over):
 * Brouillon, En ligne or Fermé; the version people fill (v3); and "Modifications non
 * publiées" when the draft differs from it. No hooks: drawn on the server and in the editor.
 */
export function FormBadges({ lang, status, version, pending }: { lang: Lang; status: 'draft' | 'open' | 'closed'; version: number | null; pending: boolean }) {
  return (
    <span className="fo-badges">
      <span className={`fo-badge is-${status}`}>{ft(lang, `status_${status}`)}</span>
      {version !== null && <VersionBadge version={version} />}
      {pending && version !== null && <span className="fo-badge is-pending">{ft(lang, 'badge_pending')}</span>}
    </span>
  );
}

export function VersionBadge({ version }: { version: number }) {
  return <span className="fo-badge is-version">v{version}</span>;
}
