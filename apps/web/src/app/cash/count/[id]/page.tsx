import { AccountantButton } from '@/components/cash/accountant-button';
import { AccessDenied, authorize } from '@/lib/access';
import { cashDb } from '@/lib/cash/db';
import { ct } from '@/lib/cash/i18n';
import { CASH_APP } from '@/lib/cash/math';
import { countDetail } from '@/lib/cash/store';
import { getCashViewer } from '@/lib/cash/viewer';
import { getLang } from '@/lib/lang';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster } from '@/lib/viewer';
import { formatCents } from '@hub/core';
import { can } from '@hub/rbac';
import Link from 'next/link';

const sizeOf = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/**
 * One count, everything in it (App.html renderDailyDetail). Authorised against the
 * restaurant ON THE RECORD (safe-count §3); a count someone may not see reads exactly
 * like one that does not exist.
 */
export default async function CountDetailPage({ params }: PageProps<'/cash/count/[id]'>) {
  const [cash, lang, { id }] = await Promise.all([getCashViewer(), getLang(), params]);
  if (!cash) return null;

  const n = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  const d = Number.isSafeInteger(n) ? await countDetail(cashDb(), n) : null;
  let allowed = false;
  if (d) {
    try {
      await authorize(CASH_APP, 'count', 'view', d.restaurantId);
      allowed = true;
    } catch (e) {
      if (!(e instanceof AccessDenied)) throw e;
    }
  }
  if (!d || !allowed) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <Link href="/cash/day" className="textlink">
          {ct(lang, 'back_to_list')}
        </Link>
        <p className="cb-note">{ct(lang, 'no_counts_here')}</p>
      </main>
    );
  }

  const [restaurants, roster] = await Promise.all([listRestaurants(), getRoster()]);
  const name = restaurants.find((r) => r.id === d.restaurantId)?.name ?? d.restaurantId;
  const canSend = cash.isManager && can(roster, cash.email, CASH_APP, 'accountant', 'send', d.restaurantId);
  const money = (c: number) => formatCents(c, lang);
  const signed = (c: number) => (c > 0 ? '+' : '') + money(c);
  const tone = (c: number) => (c < 0 ? 'neg' : c > 0 ? 'pos' : 'zero');

  return (
    <main id="main" className="page cb" lang={lang}>
      <Link href={`/cash/day?date=${d.countDate}`} className="textlink">
        {ct(lang, 'back_to_list')}
      </Link>
      <div className="pagehead">
        <h1>{ct(lang, 'count_detail')}</h1>
        <p>
          {name}, {d.countDate} {d.countTime}, {d.managerName}
        </p>
      </div>

      <div className="cb-detailactions">
        {d.pdfUrl && (
          <a href={`/cash/count/${d.id}/pdf`} target="_blank" rel="noopener" className="cb-ghost">
            {ct(lang, 'view_pdf')}
          </a>
        )}
        {canSend && <AccountantButton lang={lang} countId={d.id} />}
      </div>

      <section className="card cb-summary">
        <div>
          <span>{ct(lang, 'grand_total')}</span>
          <b>{money(d.grandTotalCents)}</b>
        </div>
        <div>
          <span>{ct(lang, 'expected_total')}</span>
          <b className="muted">{money(d.expectedTotalCents)}</b>
        </div>
        <div>
          <span>{ct(lang, 'variance')}</span>
          <b className={`cb-var ${tone(d.varianceCents)}`}>{signed(d.varianceCents)}</b>
        </div>
      </section>

      {d.tills.length > 0 && (
        <section>
          <h2 className="cb-sec">
            {ct(lang, 'section_tills')}, {money(d.tillsTotalCents)}
          </h2>
          <div className="card cb-lines">
            {d.tills.map((t) => (
              <div key={t.tillNumber} className="cb-line">
                <span>
                  <b>{t.tillLabel}</b> <small>{ct(lang, 'base_amount')}&nbsp;: {money(t.baseAmountCents)}</small>
                </span>
                <span>
                  {money(t.countedAmountCents)} <b className={`cb-var ${tone(t.varianceCents)}`}>{signed(t.varianceCents)}</b>{' '}
                  {t.wasFixed && <span className="cb-badge fixed">{ct(lang, 'fixed')}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="cb-cols3">
        <section>
          <h2 className="cb-sec">
            {ct(lang, 'section_coins')}, {money(d.coinsTotalCents)}
          </h2>
          <div className="card cb-lines">
            {d.coins.map((c) => (
              <div key={c.denominationCents} className="cb-line">
                <span>{money(c.denominationCents)}</span>
                <span className="dim">
                  {c.rolls} {ct(lang, 'rolls').toLowerCase()} + {c.looseCount} {ct(lang, 'loose').toLowerCase()}
                </span>
                <b>{money(c.totalCents)}</b>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="cb-sec">
            {ct(lang, 'section_paper')}, {money(d.paperTotalCents)}
          </h2>
          <div className="card cb-lines">
            {d.paper.map((p) => (
              <div key={p.denominationCents} className="cb-line">
                <span>{money(p.denominationCents)}</span>
                <span className="dim">{p.count}×</span>
                <b>{money(p.totalCents)}</b>
              </div>
            ))}
          </div>
        </section>
        {d.pettyCash.length > 0 && (
          <section>
            <h2 className="cb-sec">
              {ct(lang, 'section_petty')}, {money(d.pettyCashTotalCents)}
            </h2>
            <div className="card cb-lines">
              {d.pettyCash.map((p, i) => (
                <div key={i} className="cb-line">
                  <span>{p.description ?? '–'}</span>
                  <b>{money(p.amountCents)}</b>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {d.fixes.length > 0 && (
        <section>
          <h2 className="cb-sec cb-warnhead">{ct(lang, 'till_fixes_title')}</h2>
          <div className="card warn cb-lines">
            {/* The old screen said "taken from intake" for an over too (App.html:2206). */}
            {d.fixes.map((f) => (
              <p key={f.tillNumber} className="cb-line">
                {ct(lang, 'till')} #{f.tillNumber}&nbsp;: {money(Math.abs(f.intakeDeltaCents))} {ct(lang, f.intakeDeltaCents < 0 ? 'taken_from_intake' : 'returned_to_intake')}
              </p>
            ))}
          </div>
        </section>
      )}

      {d.comments && (
        <section>
          <h2 className="cb-sec">{ct(lang, 'comments')}</h2>
          <div className="card cb-comments">{d.comments}</div>
        </section>
      )}

      {d.attachments.length > 0 && (
        <section>
          <h2 className="cb-sec">{ct(lang, 'section_attachments')}</h2>
          <div className="card cb-lines">
            {d.attachments.map((a) => (
              <div key={a.id} className="cb-line">
                <span>
                  <b>{a.fileName}</b> <small>{sizeOf(a.fileSize)}</small>
                </span>
                <a href={`/cash/files/${a.id}`} target="_blank" rel="noopener" className="textlink">
                  {ct(lang, 'view_file')}
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
