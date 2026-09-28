import { cashDb } from '@/lib/cash/db';
import { dateParam } from '@/lib/cash/dates';
import { ct } from '@/lib/cash/i18n';
import { CASH_APP } from '@/lib/cash/math';
import { countsOn, expectedTotals } from '@/lib/cash/store';
import { getCashViewer } from '@/lib/cash/viewer';
import { formatDay } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { getRoster } from '@/lib/viewer';
import { businessDate, formatCents } from '@hub/core';
import { can } from '@hub/rbac';
import Link from 'next/link';

/**
 * One restaurant's day (App.html renderRestaurant), opened from the dashboard: its
 * latest count against what the safe should hold, then every count of the day.
 */
export default async function RestaurantPage({ params, searchParams }: PageProps<'/cash/restaurant/[id]'>) {
  const [cash, lang, { id }, sp] = await Promise.all([getCashViewer(), getLang(), params, searchParams]);
  if (!cash) return null;
  const store = cash.stores.find((s) => s.id === decodeURIComponent(id));
  const allowed = !!store && can(await getRoster(), cash.email, CASH_APP, 'daily_counts', 'view', store.id);
  if (!store || !allowed) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <p className="cb-note">{ct(lang, 'err_denied')}</p>
      </main>
    );
  }

  const today = businessDate();
  const date = dateParam(sp.date) ?? today;
  const [counts, expected] = await Promise.all([countsOn(cashDb(), date, [store.id]), expectedTotals(cashDb(), [store.id])]);
  const exp = expected.get(store.id);
  const latest = counts.at(-1);
  const money = (c: number) => formatCents(c, lang);
  const signed = (c: number) => (c > 0 ? '+' : '') + money(c);

  return (
    <main id="main" className="page cb" lang={lang}>
      <div className="cb-greet">
        <div>
          <h1>{store.name}</h1>
          <p>
            {store.id} · {counts.length} {ct(lang, counts.length === 1 ? 'count_one' : 'count_many')}{' '}
            {date === today ? ct(lang, 'today_word') : `· ${formatDay(lang, new Date(`${date}T12:00:00Z`))}`}
            {exp !== undefined && ` · ${money(exp)} ${ct(lang, 'expected_total').toLowerCase()}`}
          </p>
        </div>
        {cash.canCount && (
          <Link href={`/cash/new?store=${encodeURIComponent(store.id)}`} className="pbtn">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{ct(lang, 'nav_count')}</span>
          </Link>
        )}
      </div>

      {latest && (
        <section className="card cb-band">
          <div>
            <span className="lbl">{ct(lang, 'latest_count')}</span>
            <b className={`cb-var ${latest.varianceCents === 0 ? 'zero' : 'neg'}`}>{signed(latest.varianceCents)}</b>
          </div>
          <div className="mid">
            <span className="line">
              <span>
                {money(latest.grandTotalCents)} {ct(lang, 'counted_of')} {money(latest.expectedTotalCents)}
              </span>
              <span className="dim">
                {latest.countTime} · {latest.managerName}
              </span>
            </span>
            <span className="meter">
              {latest.expectedTotalCents > 0 && (
                <span
                  className={latest.varianceCents === 0 ? 'ok' : 'neg'}
                  style={{ width: `${Math.max(0, Math.min(100, (latest.grandTotalCents / latest.expectedTotalCents) * 100))}%` }}
                />
              )}
            </span>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="ph">
          <div>
            <h2>{ct(lang, 'counts_on_day')}</h2>
            <p>{ct(lang, 'counts_on_day_sub')}</p>
          </div>
        </div>
        {counts.length === 0 ? (
          <p className="cb-empty">{ct(lang, 'no_counts_here')}</p>
        ) : (
          <ul className="cb-rests">
            {counts.map((c, i) => (
              <li key={c.id}>
                <Link href={`/cash/count/${c.id}`} className="cb-dayrow">
                  <b>{c.countTime}</b>
                  <span className="dim">{c.managerName}</span>
                  <span className="tag">{i === counts.length - 1 ? ct(lang, 'latest_tag') : ''}</span>
                  <span className="dim num">{money(c.grandTotalCents)}</span>
                  <span className={`cb-var num ${c.varianceCents === 0 ? 'zero' : 'neg'}`}>{signed(c.varianceCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
