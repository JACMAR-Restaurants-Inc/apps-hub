import { formsDb } from '@/lib/forms/db';
import { say, sensitiveIds, type Field, type FormDefinition, type Value } from '@/lib/forms/definition';
import { ft } from '@/lib/forms/i18n';
import { canEditForms, responsesScope } from '@/lib/forms/rules';
import { allVersions, getForm, listSubmissions } from '@/lib/forms/store';
import type { Lang } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { restaurantLabel } from '@/lib/labels';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster, getViewer } from '@/lib/viewer';
import { businessDate, businessTime } from '@hub/core';
import Link from 'next/link';

/**
 * A form's answers: every one for HR and admins, a manager's restaurants' for a manager
 * holding Forms (owner, 2026-10-09). Anyone else reads that it is not available, whether
 * or not it exists. Columns are the latest version's questions, then any an older version
 * asked that it no longer does, so nothing answered is hidden.
 */
export default async function ResponsesPage({ params }: PageProps<'/forms/[id]/responses'>) {
  const [viewer, lang, roster, { id }] = await Promise.all([getViewer(), getLang(), getRoster(), params]);
  if (!viewer) return null;
  const scope = responsesScope(roster, viewer.email);
  const form = /^\d{1,9}$/.test(id) ? await getForm(formsDb(), Number(id)) : null;
  // A manager never sees a draft's page; HR may, though it has no answers yet.
  const visible = form && (scope === 'all' || scope.length > 0) && (form.currentVersion !== null || canEditForms(roster, viewer.email));
  const back = (
    <Link className="backlink" href="/forms">
      ← {ft(lang, 'back')}
    </Link>
  );
  if (!form || !visible) {
    return (
      <div className="pagehead">
        {back}
        <p>{ft(lang, 'not_available')}</p>
      </div>
    );
  }

  const [rows, versions, stores] = await Promise.all([listSubmissions(formsDb(), form.id, scope), allVersions(formsDb(), form.id), listRestaurants()]);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const columns = columnsOf(versions, form.currentVersion);
  const sensitive = new Set([...versions.values()].flatMap(sensitiveIds));

  return (
    <>
      <div className="pagehead">
        {back}
        <h1>{form.title}</h1>
        <p>{ft(lang, scope === 'all' ? 'responses' : 'responses_of')}</p>
        <p className="pgcount">{rows.length}</p>
      </div>
      <section className="panel">
        {rows.length === 0 ? (
          <p className="favempty">{ft(lang, 'no_responses')}</p>
        ) : (
          <div className="fo-tablewrap">
            <table className="fo-table">
              <thead>
                <tr>
                  <th>{ft(lang, 'submitted')}</th>
                  <th>{ft(lang, 'name')}</th>
                  <th>{ft(lang, 'number')}</th>
                  <th>{ft(lang, 'restaurant')}</th>
                  {columns.map((c) => (
                    <th key={c.id}>{say(c.label, lang)}</th>
                  ))}
                  <th>{ft(lang, 'signature')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{`${businessDate(r.submittedAt)} ${businessTime(r.submittedAt)}`}</td>
                    <td>{r.fullName ?? r.email}</td>
                    <td>{r.employeeNumber ?? ''}</td>
                    <td>{r.restaurantId ? restaurantLabel(r.restaurantId, names.get(r.restaurantId)) : ''}</td>
                    {columns.map((c) =>
                      r.sensitiveClearedAt && sensitive.has(c.id) ? (
                        <td key={c.id} className="fo-cleared">
                          {ft(lang, 'cleared')}
                        </td>
                      ) : (
                        <td key={c.id}>{show(lang, versions.get(r.version)?.fields.find((f) => f.id === c.id) ?? c, r.answers[c.id])}</td>
                      ),
                    )}
                    <td>{r.signedName ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** The latest version's questions first, then those only older versions asked. */
function columnsOf(versions: Map<number, FormDefinition>, current: number | null): Field[] {
  const order = [...versions.keys()].sort((a, b) => (a === current ? -1 : b === current ? 1 : b - a));
  const seen = new Set<string>();
  const out: Field[] = [];
  for (const v of order) {
    for (const f of versions.get(v)!.fields) {
      if (f.type === 'heading' || seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

/** An answer as text, with option labels from the version it answered. */
function show(lang: Lang, field: Field, value: Value | undefined): string {
  if (value === undefined) return '';
  if (value === true) return ft(lang, 'yes');
  const label = (id: string) => say(field.options?.find((o) => o.id === id)?.label, lang) || id;
  if (Array.isArray(value)) return value.map(label).join(', ');
  if (field.type === 'choice' && typeof value === 'string') return label(value);
  return String(value);
}
