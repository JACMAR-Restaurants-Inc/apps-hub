'use client';

import { dt } from '@/lib/devops/i18n';
import { PRIORITIES, TYPES, type Filters } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Search, type, priority and assignee (the old FilterBar), kept in the address so a
 * filtered view can be shared and survives a refresh. The old one reset on every
 * project switch and lived only in memory.
 */
export function FilterBar({ lang, filters, people }: { lang: Lang; filters: Filters; people: { email: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(filters.q);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  // The search waits for a pause in typing rather than reloading on every key.
  useEffect(() => {
    if (q === filters.q) return;
    const id = setTimeout(() => set('q', q.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const any = filters.q || filters.type || filters.priority || filters.assignee;
  return (
    <div className="dv-filters" role="search">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt(lang, 'filter_search')} aria-label={dt(lang, 'filter_search')} />
      <select value={filters.type} onChange={(e) => set('type', e.target.value)} aria-label={dt(lang, 'field_type')}>
        <option value="">{dt(lang, 'filter_all_types')}</option>
        {TYPES.map((v) => (
          <option key={v} value={v}>
            {dt(lang, `type_${v}`)}
          </option>
        ))}
      </select>
      <select value={filters.priority} onChange={(e) => set('priority', e.target.value)} aria-label={dt(lang, 'field_priority')}>
        <option value="">{dt(lang, 'filter_all_priorities')}</option>
        {PRIORITIES.map((v) => (
          <option key={v} value={v}>
            {dt(lang, `priority_${v}`)}
          </option>
        ))}
      </select>
      <select value={filters.assignee} onChange={(e) => set('assignee', e.target.value)} aria-label={dt(lang, 'field_assignee')}>
        <option value="">{dt(lang, 'filter_everyone')}</option>
        <option value="none">{dt(lang, 'filter_unassigned')}</option>
        {people.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name}
          </option>
        ))}
      </select>
      {any && (
        <button
          type="button"
          className="dv-btn ghost"
          onClick={() => {
            setQ('');
            const next = new URLSearchParams();
            if (params.get('view')) next.set('view', params.get('view')!);
            router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
          }}
        >
          {dt(lang, 'filter_clear')}
        </button>
      )}
    </div>
  );
}
