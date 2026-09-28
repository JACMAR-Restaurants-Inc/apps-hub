import { AdminRestaurantCard } from '@/components/cash/admin-restaurant';
import { cashDb } from '@/lib/cash/db';
import { ct, type CashKey } from '@/lib/cash/i18n';
import { adminOverview, nextTillNumber, recentChanges } from '@/lib/cash/settings';
import { getCashViewer } from '@/lib/cash/viewer';
import { getLang } from '@/lib/lang';
import { formatCents } from '@hub/core';

/**
 * Admin (App.html renderAdmin), rebuilt: per restaurant, the expected total, report
 * address and tills, then the journal of every change. The admin panel's people only
 * (the office and system admins), and only for restaurants they hold.
 */
export default async function CashAdminPage() {
  const [cash, lang] = await Promise.all([getCashViewer(), getLang()]);
  if (!cash) return null;
  if (!cash.isAdmin) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <p className="cb-note">{ct(lang, 'err_denied')}</p>
      </main>
    );
  }
  const ids = cash.stores.map((s) => s.id);
  const [overview, log, next] = await Promise.all([
    adminOverview(cashDb(), ids),
    recentChanges(cashDb(), ids),
    Promise.all(ids.map(async (id) => [id, await nextTillNumber(cashDb(), id)] as const)),
  ]);
  const nextTill = new Map(next);
  const names = new Map(cash.stores.map((s) => [s.id, s.name]));
  const when = (d: Date) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(d);
  const show = (event: string, v: string | null) =>
    v === null ? '–' : event === 'expected_total' || event === 'till_base' ? formatCents(Number(v), lang) : event === 'till_add' ? v.replace(/ · (\d+)$/, (_, c) => ` · ${formatCents(Number(c), lang)}`) : v;

  return (
    <main id="main" className="page cb" lang={lang}>
      <div className="pagehead">
        <h1>{ct(lang, 'admin_title')}</h1>
        <p>{ct(lang, 'adm_line')}</p>
      </div>
      {cash.stores.map((s) => (
        <AdminRestaurantCard
          // Keyed by restaurant only, so the card keeps its "Enregistré." after a save;
          // the till rows reset themselves (their key carries their values).
          key={s.id}
          lang={lang}
          id={s.id}
          name={s.name}
          data={overview.get(s.id)!}
          nextTill={nextTill.get(s.id) ?? 1}
        />
      ))}
      <section className="panel">
        <div className="ph">
          <h2>{ct(lang, 'adm_log')}</h2>
        </div>
        {log.length === 0 ? (
          <p className="cb-empty">{ct(lang, 'adm_log_none')}</p>
        ) : (
          <ul className="cb-log">
            {log.map((e) => (
              <li key={e.id}>
                <span className="when">{when(e.at)}</span>
                <span>
                  <b>{names.get(e.restaurantId) ?? e.restaurantId}</b> · {ct(lang, `ev_${e.event}` as CashKey)}
                  {e.tillNumber !== null && ` #${e.tillNumber}`}
                  {(e.before !== null || e.after !== null) && (
                    <>
                      {' '}
                      <span className="dim">{show(e.event, e.before)}</span> → <b>{show(e.event, e.after)}</b>
                    </>
                  )}
                </span>
                <span className="who">{e.actorEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
