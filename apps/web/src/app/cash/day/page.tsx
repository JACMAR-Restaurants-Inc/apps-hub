import { DayFilters } from '@/components/cash/day-filters';
import { cashDb } from '@/lib/cash/db';
import { dateParam } from '@/lib/cash/dates';
import { ct } from '@/lib/cash/i18n';
import { countsOn } from '@/lib/cash/store';
import { getCashViewer } from '@/lib/cash/viewer';
import { getLang } from '@/lib/lang';
import { businessDate, formatCents } from '@hub/core';
import Link from 'next/link';

/** Vue quotidienne (App.html renderDaily): every count of a day, at the restaurants this person holds. */
export default async function DailyPage({ searchParams }: PageProps<'/cash/day'>) {
  const [cash, lang, sp] = await Promise.all([getCashViewer(), getLang(), searchParams]);
  if (!cash) return null;

  const date = dateParam(sp.date) ?? businessDate();
  const store = typeof sp.store === 'string' && cash.stores.some((s) => s.id === sp.store) ? sp.store : '';
  const ids = store ? [store] : cash.stores.map((s) => s.id);
  const counts = await countsOn(cashDb(), date, ids);
  const names = new Map(cash.stores.map((s) => [s.id, s.name]));
  const many = cash.stores.length > 1;
  const money = (c: number) => formatCents(c, lang);

  return (
    <main id="main" className="page cb" lang={lang}>
      <div className="pagehead">
        <h1>{ct(lang, 'daily_title')}</h1>
        <p>{ct(lang, 'daily_subtitle')}</p>
      </div>
      <DayFilters key={`${date}|${store}`} lang={lang} date={date} store={store} stores={cash.stores} />
      {counts.length === 0 ? (
        <p className="cb-note cb-empty">{ct(lang, 'no_counts_day')}</p>
      ) : (
        <ul className="cb-daylist">
          {counts.map((c) => (
            <li key={c.id}>
              <Link href={`/cash/count/${c.id}`} className="card cb-daycard">
                <span className="top">
                  <span>
                    <b>
                      {c.countTime}, {c.managerName}
                    </b>
                    {many && <span className="rest">{names.get(c.restaurantId) ?? c.restaurantId}</span>}
                  </span>
                  <span className={c.varianceCents === 0 ? 'cb-badge ok' : 'cb-badge off'}>
                    {c.varianceCents === 0 ? 'OK' : (c.varianceCents > 0 ? '+' : '') + money(c.varianceCents)}
                  </span>
                </span>
                <span className="cb-prevgrid">
                  <span>
                    <span className="dt">{ct(lang, 'section_tills')}</span>
                    <span className="dd">{money(c.tillsTotalCents)}</span>
                  </span>
                  <span>
                    <span className="dt">{ct(lang, 'section_coins')}</span>
                    <span className="dd">{money(c.coinsTotalCents)}</span>
                  </span>
                  <span>
                    <span className="dt">{ct(lang, 'section_paper')}</span>
                    <span className="dd">{money(c.paperTotalCents)}</span>
                  </span>
                  <span>
                    <span className="dt">{ct(lang, 'petty_total_label')}</span>
                    <span className="dd">{money(c.pettyCashTotalCents)}</span>
                  </span>
                </span>
                <span className="bottom">
                  <b>
                    {ct(lang, 'grand_total')}&nbsp;: {money(c.grandTotalCents)}
                  </b>
                  <span>
                    {ct(lang, 'expected_total')}&nbsp;: {money(c.expectedTotalCents)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
