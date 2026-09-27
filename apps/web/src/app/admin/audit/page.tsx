import { Footer, TopBar } from '@/components/top-bar';
import { readAudit } from '@/lib/admin/settings';
import { db } from '@/lib/db';
import { loadHome } from '@/lib/home-data';
import { dict, t, type Key } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { getViewer } from '@/lib/viewer';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const EVENTS = ['request', 'grant', 'update', 'decline', 'revoke', 'notify', 'denied', 'user_active', 'admin_add', 'admin_remove', 'admin_notify', 'restaurant_add', 'restaurant_active', 'signed_in_no_grants', 'name_corrected', 'person_deleted'];

/**
 * The audit log, read-only, newest first (RBAC §7: "the only record you control of who
 * from outside the company accessed what"). A plain GET form, so a filter is a link.
 */
export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  // Signed out (or the session expired, e.g. while the directory refreshed itself):
  // back to the door. Signed in but not an admin: a 404, so the page is not advertised.
  if (!viewer) redirect('/');
  if (viewer.standing !== 'admin') notFound();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const q = one(sp.q).slice(0, 120);
  const event = EVENTS.includes(one(sp.event)) ? one(sp.event) : '';
  const before = Number(one(sp.before)) || undefined;
  const [home, log] = await Promise.all([loadHome(viewer, lang), readAudit(db(), { q, event, before, limit: 100 })]);

  const when = (d: Date) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      timeZone: 'America/Toronto',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  const evName = (e: string) => (`ev_${e}` in dict ? t(lang, `ev_${e}` as Key) : e);
  // The detail in words, not JSON: "avant : non · après : oui", roles and stores as the
  // directory writes them. Keys the page has no words for are shown as they are.
  const yes = t(lang, 'yes');
  const no = t(lang, 'no');
  const val = (v: unknown): string =>
    v === true ? yes : v === false ? no : v == null ? '—' : Array.isArray(v) ? v.map(val).join(', ') || '—' : typeof v === 'object' ? Object.entries(v as object).map(([k, x]) => `${word(k)}${colon}${val(x)}`).join(', ') : String(v);
  const colon = lang === 'fr' ? '\u00a0: ' : ': ';
  const WORDS: Record<string, [string, string]> = {
    before: ['avant', 'before'], after: ['après', 'after'], role: ['rôle', 'role'], stores: ['restaurants', 'restaurants'],
    status: ['état', 'status'], result: ['résultat', 'result'], reason: ['raison', 'reason'], mail: ['courriel', 'email'],
    sent: ['envoyé', 'sent'], to: ['à', 'to'], resource: ['ressource', 'resource'], action: ['action', 'action'],
    employeeNumber: ['employé', 'employee'], askedAgain: ['redemande', 'asked again'], notify: ['avis', 'notify'], name: ['nom', 'name'],
  };
  const word = (k: string) => (WORDS[k] ? WORDS[k][lang === 'fr' ? 0 : 1] : k);
  const detail = (d: unknown) =>
    d && typeof d === 'object'
      ? Object.entries(d as object)
          .filter(([k]) => !['id', 'ids', 'redirected', 'fellBack'].includes(k))
          // Postgres (jsonb) reorders keys; a change reads before, then after.
          .sort(([a], [b]) => (a === 'before' ? -1 : b === 'before' ? 1 : 0))
          .map(([k, v]) => `${word(k)}${colon}${val(v)}`)
          .join(' · ')
      : '';
  const oldest = log.rows.at(-1)?.id;
  const olderHref = `/admin/audit?${new URLSearchParams({ ...(q && { q }), ...(event && { event }), before: String(oldest ?? '') })}`;

  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <main className="page" lang={lang}>
        <Link href="/admin/settings" className="backlink">
          <span aria-hidden="true">←</span> {t(lang, 'navSettings')}
        </Link>
        <div className="ph">
          <div>
            <h1 className="h1">{t(lang, 'auditTitle')}</h1>
            <p>{t(lang, 'auditHelp')}</p>
          </div>
        </div>
        <form className="dirtools" method="get" action="/admin/audit">
          <input className="filter" type="search" name="q" defaultValue={q} placeholder={t(lang, 'auditFilter')} aria-label={t(lang, 'auditFilter')} />
          <select className="storefilter" name="event" defaultValue={event} aria-label={t(lang, 'allEvents')}>
            <option value="">{t(lang, 'allEvents')}</option>
            {EVENTS.map((e) => (
              <option key={e} value={e}>
                {evName(e)}
              </option>
            ))}
          </select>
          <button type="submit" className="sbtn">
            {t(lang, 'filterPeople').split(' ')[0]}
          </button>
        </form>
        {log.rows.length === 0 ? (
          <p>{t(lang, 'noEntries')}</p>
        ) : (
          <div className="setlist">
            {log.rows.map((r) => (
              <div className="setrow" key={r.id}>
                <div className="who">
                  <b>
                    {evName(r.event)}
                    {r.app && <span className="mini" style={{ marginLeft: 6 }}>{r.app}</span>}
                  </b>
                  <span>
                    {r.actorEmail ?? '—'}
                    {(r.targetEmail || r.restaurantId) && ` → ${r.targetEmail ?? r.restaurantId}`}
                  </span>
                  {detail(r.detail) && <span style={{ display: 'block', color: 'var(--text-dim)' }}>{detail(r.detail)}</span>}
                </div>
                <div className="acts">
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{when(r.at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {log.rows.length === 100 && oldest && (
          <Link href={olderHref} className="viewall" style={{ marginLeft: 0 }}>
            {t(lang, 'older')}
          </Link>
        )}
      </main>
      <Footer lang={lang} />
    </>
  );
}
