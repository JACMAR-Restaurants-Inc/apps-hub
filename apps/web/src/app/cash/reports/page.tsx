import { RetryButton } from '@/components/cash/retry-button';
import { cashDb } from '@/lib/cash/db';
import { ct, type CashKey } from '@/lib/cash/i18n';
import { listReports } from '@/lib/cash/reports';
import { getCashViewer } from '@/lib/cash/viewer';
import { getLang } from '@/lib/lang';
import { listRestaurants } from '@/lib/restaurants';
import { formatCents } from '@hub/core';
import Link from 'next/link';

/** Why an email did not go, in words, from the reason the queue recorded. */
function why(error: string | null): CashKey {
  if (error === 'no_address') return 'rep_why_no_address';
  if (error === 'email_not_configured') return 'rep_why_not_configured';
  if (error && /unauthorized_client|token_/.test(error)) return 'rep_why_gmail';
  return 'rep_why_other';
}

/**
 * Rapports (new; the old app kept no record of its emails): every report the queue
 * prepared, its PDF, and each email with who it was for, what it said, what was
 * attached, and whether it went. While Gmail is not authorised this is how the whole
 * flow is seen; afterwards it is the send history. The Admin tab's people only.
 */
export default async function ReportsPage() {
  const [cash, lang] = await Promise.all([getCashViewer(), getLang()]);
  if (!cash) return null;
  if (!cash.isAdmin) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <p className="cb-note">{ct(lang, 'err_denied')}</p>
      </main>
    );
  }
  const [rows, restaurants] = await Promise.all([listReports(cashDb(), cash.stores.map((s) => s.id)), listRestaurants()]);
  const name = (id: string) => restaurants.find((r) => r.id === id)?.name ?? id;
  const money = (c: number) => formatCents(c, lang);
  const when = (d: Date) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(d);

  return (
    <main id="main" className="page cb" lang={lang}>
      <div className="pagehead">
        <h1>{ct(lang, 'reports_title')}</h1>
        <p>{ct(lang, 'reports_line')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="cb-note cb-empty">{ct(lang, 'reports_none')}</p>
      ) : (
        <ul className="cb-reports">
          {rows.map((r) => (
            <li key={r.jobId} className="card">
              <div className="cb-rephead">
                <span>
                  <Link href={`/cash/count/${r.countId}`}>
                    <b>
                      {name(r.restaurantId)}, {r.countDate} {r.countTime}
                    </b>
                  </Link>
                  <small>
                    {r.managerName} · {r.varianceCents > 0 ? '+' : ''}
                    {money(r.varianceCents)}
                    {!r.restaurantEmail && ` · ${ct(lang, 'rep_accountant_only')}`}
                  </small>
                </span>
                <span className={`cb-badge ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'off' : 'wait'}`}>
                  {ct(lang, r.status === 'sent' ? 'rep_sent' : r.status === 'failed' ? 'rep_failed' : 'rep_pending')}
                </span>
              </div>
              <div className="cb-repmeta">
                {r.hasPdf && (
                  <a href={`/cash/count/${r.countId}/pdf`} target="_blank" rel="noopener" className="textlink">
                    {ct(lang, 'view_pdf')}
                  </a>
                )}
                <small>{ct(lang, 'rep_attempts').replace('{n}', String(r.attempts))}</small>
                <small>{when(r.createdAt)}</small>
                {r.status !== 'sent' && <RetryButton lang={lang} jobId={r.jobId} />}
              </div>
              {r.emails.length === 0 ? (
                <p className="cb-repnone">{ct(lang, r.status === 'sent' ? 'rep_legacy' : 'rep_waiting')}</p>
              ) : (
                r.emails.map((m) => (
                  <details key={m.kind} className="cb-mail">
                    <summary>
                      <span className={`cb-dot ${m.status === 'sent' ? 'ok' : 'off'}`} aria-hidden="true" />
                      <b>{ct(lang, m.kind === 'restaurant' ? 'rep_restaurant' : 'rep_accountant')}</b>
                      <span className="to">{m.toAddress ?? ct(lang, 'rep_no_address')}</span>
                      <span className="st">{m.status === 'sent' ? ct(lang, 'rep_sent') : `${ct(lang, 'rep_failed')}, ${ct(lang, why(m.error))}`}</span>
                    </summary>
                    <div className="cb-mailbody">
                      <p className="subj">{m.subject}</p>
                      {m.attachmentNames.length > 0 && (
                        <p className="att">
                          {ct(lang, 'rep_attached')}&nbsp;: {m.attachmentNames.join(', ')}
                        </p>
                      )}
                      <pre>{m.bodyText}</pre>
                      {m.error && <p className="err">{m.error}</p>}
                    </div>
                  </details>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
