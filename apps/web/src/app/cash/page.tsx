import { cashDb } from '@/lib/cash/db';
import { dashboard, weekBefore } from '@/lib/cash/dashboard';
import { ct } from '@/lib/cash/i18n';
import { countsSince, expectedTotals } from '@/lib/cash/store';
import { getCashViewer } from '@/lib/cash/viewer';
import { greetingPart, prettyFirstName, torontoHour } from '@/lib/home';
import { formatDay } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { businessDate, formatCents } from '@hub/core';
import Link from 'next/link';

/**
 * Cash Balancing's dashboard (App.html renderDashboard): the greeting and today's
 * date, four figures, each restaurant's latest count today against what its safe
 * should hold, and what needs attention. Only the restaurants the roster grants.
 */
export default async function CashDashboard({ searchParams }: PageProps<'/cash'>) {
  const [cash, lang, sp] = await Promise.all([getCashViewer(), getLang(), searchParams]);
  if (!cash) return null; // the layout says why

  const today = businessDate();
  const ids = cash.stores.map((s) => s.id);
  const [week, expected] = await Promise.all([countsSince(cashDb(), weekBefore(today), ids), expectedTotals(cashDb(), ids)]);
  const d = dashboard(today, cash.stores, week, expected);

  const money = (c: number) => formatCents(c, lang);
  const signed = (c: number) => (c > 0 ? '+' : '') + money(c);
  const greet = ct(lang, `greet_${greetingPart(torontoHour())}` as const);
  const first = prettyFirstName(cash.name);
  const one = d.stores.length === 1 ? d.stores[0]! : null;
  const uncounted = d.stores.filter((s) => !s.last);
  const off = d.stores.filter((s) => s.last && s.last.varianceCents !== 0);

  return (
    <main id="main" className="page cb" lang={lang}>
      {typeof sp.submitted === 'string' && (
        <p className="cb-flash" role="status">
          {ct(lang, 'submit_success')}
        </p>
      )}
      <div className="cb-greet">
        <div>
          <h1>{greet + (first ? `, ${first}` : '')}</h1>
          <p>
            {formatDay(lang, new Date())} ·{' '}
            {one
              ? `${one.name} · ${one.last ? `${ct(lang, 'last_count')} ${one.last.time}` : ct(lang, 'no_count_today')}`
              : `${d.stores.length} ${ct(lang, 'dash_safes')} · ${d.counted} ${ct(lang, 'dash_counted_today')}`}
          </p>
        </div>
        {cash.canCount && (
          <Link href="/cash/new" className="pbtn">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{ct(lang, 'nav_count')}</span>
          </Link>
        )}
      </div>

      <div className="stats cb-stats">
        <div className="stat blue">
          <div className="k">{ct(lang, 'stat_counts_today')}</div>
          <div className="v">{d.countsToday}</div>
        </div>
        <div className="stat orange">
          <div className="k">{ct(lang, 'stat_counts_week')}</div>
          <div className="v">{d.countsWeek}</div>
        </div>
        <div className="stat pink">
          <div className="k">{ct(lang, 'stat_safes_short')}</div>
          <div className="v">{d.short}</div>
        </div>
        <div className={`stat ${d.netCents === 0 ? 'green' : 'pink'}`}>
          <div className="k">{ct(lang, 'stat_net_latest')}</div>
          <div className="v">{money(d.netCents)}</div>
        </div>
      </div>

      <div className="cb-two">
        <section className="panel">
          <div className="ph">
            <div>
              <h2>{ct(lang, 'rest_panel_title')}</h2>
              <p>{ct(lang, 'rest_panel_sub')}</p>
            </div>
          </div>
          <ul className="cb-rests">
            {d.stores.map((s) => {
              const isOff = !!s.last && s.last.varianceCents !== 0;
              const pct = s.last && s.expectedCents ? Math.max(0, Math.min(100, (s.last.grandTotalCents / s.expectedCents) * 100)) : 0;
              return (
                <li key={s.id}>
                  <Link href={`/cash/restaurant/${encodeURIComponent(s.id)}`} className="cb-rest">
                    <span className="who">
                      <b>{s.name}</b>
                      <span>{s.id}</span>
                    </span>
                    <span className="mid">
                      <span className="line">
                        {s.last
                          ? `${money(s.last.grandTotalCents)} ${ct(lang, 'counted_of')} ${s.expectedCents === null ? '–' : money(s.expectedCents)}`
                          : `${ct(lang, 'no_count_today')}${s.expectedCents === null ? '' : ` · ${money(s.expectedCents)} ${ct(lang, 'expected_total').toLowerCase()}`}`}
                      </span>
                      {s.last && (
                        <span className="sub">
                          {s.last.time} · {s.last.manager}
                        </span>
                      )}
                      <span className="meter">{s.last && s.expectedCents ? <span className={isOff ? 'neg' : 'ok'} style={{ width: `${pct}%` }} /> : null}</span>
                    </span>
                    <span className={`amt cb-var ${!s.last ? '' : isOff ? 'neg' : 'zero'}`}>{s.last ? signed(s.last.varianceCents) : '–'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <div className="ph">
            <h2>{ct(lang, 'attn_title')}</h2>
          </div>
          <ul className="cb-attn">
            {off.map((s) => (
              <li key={s.id} className="neg">
                <b>
                  {s.name} {ct(lang, s.last!.varianceCents < 0 ? 'attn_short_is' : 'attn_over_is')} {money(Math.abs(s.last!.varianceCents))}
                </b>
                <span>
                  {s.last!.time} · {s.last!.manager}
                </span>
              </li>
            ))}
            {uncounted.length > 0 && (
              <li className="warn">
                <b>
                  {uncounted.length} {ct(lang, uncounted.length === 1 ? 'dash_safe_one' : 'dash_safes')} {ct(lang, 'attn_not_counted')}
                </b>
                <span>{uncounted.map((s) => s.name).join(', ')}</span>
              </li>
            )}
            {!off.length && !uncounted.length && (
              <li className="ok">
                <b>{ct(lang, 'attn_all_clear')}</b>
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
