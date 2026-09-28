import { CountForm } from '@/components/cash/count-form';
import { cashDb } from '@/lib/cash/db';
import { ct } from '@/lib/cash/i18n';
import { previousCounts, readSetup } from '@/lib/cash/store';
import { getCashViewer } from '@/lib/cash/viewer';
import { CASH_APP } from '@/lib/cash/math';
import { getLang } from '@/lib/lang';
import { getRoster } from '@/lib/viewer';
import { businessDate } from '@hub/core';
import { can } from '@hub/rbac';
import Link from 'next/link';

/**
 * Nouveau décompte (App.html renderCount). One restaurant is counted without a
 * question; someone holding several chooses first, because guessing would file a real
 * count against the wrong safe (safe-count §4). The choice is in the address
 * (?store=), so changing it starts that restaurant's own draft.
 */
export default async function NewCountPage({ searchParams }: PageProps<'/cash/new'>) {
  const [cash, lang, sp] = await Promise.all([getCashViewer(), getLang(), searchParams]);
  if (!cash) return null; // the layout says why

  if (!cash.canCount) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <p className="cb-note">{ct(lang, cash.stores.length ? 'count_not_for_you' : 'count_no_restaurants')}</p>
      </main>
    );
  }

  const asked = typeof sp.store === 'string' ? sp.store : null;
  const store = cash.stores.length === 1 ? cash.stores[0]! : cash.stores.find((s) => s.id === asked);
  if (!store) {
    return (
      <main id="main" className="page cb" lang={lang}>
        <div className="pagehead">
          <h1>{ct(lang, 'count_choose_restaurant')}</h1>
          <p>{ct(lang, 'count_choose_restaurant_hint')}</p>
        </div>
        <div className="cb-choose">
          {cash.stores.map((s) => (
            <Link key={s.id} href={`/cash/new?store=${encodeURIComponent(s.id)}`} className="cb-choice">
              <b>{s.name}</b>
              <span>{s.id}</span>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  // Drawn only for a restaurant this person may count at; the action checks again.
  const allowed = can(await getRoster(), cash.email, CASH_APP, 'new_count', 'access', store.id);
  const today = businessDate();
  const [setup, previous] = allowed
    ? await Promise.all([readSetup(cashDb(), store.id), previousCounts(cashDb(), store.id, today)])
    : [null, null];

  return (
    <main id="main" className="page cb" lang={lang}>
      {!allowed ? (
        <p className="cb-note">{ct(lang, 'err_denied')}</p>
      ) : !setup ? (
        <p className="cb-note">{ct(lang, 'err_not_configured')}</p>
      ) : (
        <CountForm
          lang={lang}
          store={store}
          canChangeStore={cash.stores.length > 1}
          managerName={cash.name}
          today={today}
          setup={setup}
          previous={previous!}
          canSendToAccountant={cash.isManager}
        />
      )}
    </main>
  );
}
