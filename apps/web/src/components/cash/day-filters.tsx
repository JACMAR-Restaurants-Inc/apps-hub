'use client';

import { ct } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';

/**
 * The daily view's date and restaurant (App.html renderDaily). Both live in the
 * address, so the restaurant filter survives everything (it used to be lost on each
 * redraw, safe-count §8), and a slow answer for an older date cannot overwrite a
 * newer one: each choice is its own page.
 */
export function DayFilters({ lang, date, store, stores }: { lang: Lang; date: string; store: string; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (d: string, s: string) => {
    const q = new URLSearchParams({ date: d });
    if (s) q.set('store', s);
    router.push(`/cash/day?${q}`);
  };
  return (
    <div className="cb-filters">
      <label className="cb-field">
        <span>{ct(lang, 'count_date')}</span>
        <input
          type="date"
          defaultValue={date}
          max="9999-12-31"
          // A full date only: typing a year digit by digit must not load four pages.
          onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && go(e.target.value, store)}
        />
      </label>
      {stores.length > 1 && (
        <label className="cb-field">
          <span>{ct(lang, 'restaurants')}</span>
          <select value={store} onChange={(e) => go(date, e.target.value)}>
            <option value="">{ct(lang, 'filter_all_restaurants')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} - {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
