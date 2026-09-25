'use client';

import { adminAccessAction, type AdminState } from '@/app/actions';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { Role } from '@hub/rbac';
import { useActionState, useState } from 'react';

export interface PanelPerson {
  app: string;
  appName: string;
  email: string;
  status: 'pending' | 'active' | 'revoked';
  role: Role | null;
  stores: string[];
  fullName: string | null;
  hrEmail: string | null;
  employeeNumber: string | null;
  clearviewStore: string | null;
  since: string;
  askedAgain: boolean;
}

/**
 * The Grant panel (RBAC §48). On a request: Review, then choose a role and restaurants
 * and Grant, or Decline. On somebody with access: Manage, to change them or Remove.
 *
 * Grant stays disabled until a role and at least one restaurant are chosen, and says
 * why. The Clearview restaurant opens ticked, marked as such. Only open restaurants are
 * offered: a closed one denies whatever a row says.
 *
 * The server re-checks everything, including that the row is still what this page
 * showed; if not it answers 'changed' and the page redraws from the database.
 */
export function GrantPanel(props: {
  lang: Lang;
  person: PanelPerson;
  roles: Role[];
  restaurants: { id: string; name: string }[];
}) {
  const { lang, person, roles, restaurants } = props;
  const isRequest = person.status === 'pending';
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(person.role);
  const [stores, setStores] = useState<string[]>(
    isRequest ? (person.clearviewStore ? [person.clearviewStore] : []) : person.stores,
  );
  const [confirming, setConfirming] = useState(false);
  const [result, formAction, pending] = useActionState<AdminState, FormData>(adminAccessAction, { outcome: null });

  const ready = role !== null && stores.length > 0;
  const message: Key | null =
    result.outcome === 'changed' ? 'changed' : result.outcome === 'invalid' ? 'invalid' : result.outcome === 'denied' || result.outcome === 'error' ? 'requestFailed' : null;
  const name = person.fullName ?? person.email;
  const toggle = (id: string) => setStores((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{name}</p>
          <p className="break-all text-sm">{person.email}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {person.appName} · {person.since}
            {!isRequest && ` · ${t(lang, person.status === 'active' ? 'status_active' : person.role ? 'status_revoked' : 'status_declined')}`}
            {person.role && ` · ${t(lang, `role_${person.role}`)}`}
            {!isRequest && person.stores.length > 0 && ` · ${person.stores.join(', ')}`}
          </p>
          {isRequest && person.askedAgain && <p className="text-sm">{t(lang, 'askedAgain')}</p>}
        </div>
        {person.status !== 'revoked' && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {t(lang, isRequest ? 'review' : 'manage')}
          </button>
        )}
      </div>

      {open && (
        <form action={formAction} className="mt-4 space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <input type="hidden" name="app" value={person.app} />
          <input type="hidden" name="email" value={person.email} />
          {(person.employeeNumber || person.hrEmail) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
              {person.employeeNumber && (
                <>
                  <dt>{t(lang, 'employee')}</dt>
                  <dd>{person.employeeNumber}</dd>
                </>
              )}
              {person.hrEmail && (
                <>
                  <dt>{t(lang, 'hrEmail')}</dt>
                  <dd className="break-all">{person.hrEmail}</dd>
                </>
              )}
            </dl>
          )}

          <fieldset>
            <legend className="text-sm font-medium">{t(lang, 'role')}</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-1.5">
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                  {t(lang, `role_${r}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">{t(lang, 'restaurants')}</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {restaurants.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5">
                  <input type="checkbox" name="stores" value={r.id} checked={stores.includes(r.id)} onChange={() => toggle(r.id)} />
                  {r.id} - {r.name}
                  {isRequest && r.id === person.clearviewStore && (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">({t(lang, 'fromClearview')})</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          {!ready && <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(lang, 'chooseRoleAndStore')}</p>}
          {message && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {t(lang, message)}
            </p>
          )}

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t(lang, isRequest ? 'confirmDecline' : 'confirmRemove')}</span>
              <button
                type="submit"
                name="intent"
                value={isRequest ? 'decline' : 'revoke'}
                disabled={pending}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {t(lang, isRequest ? 'decline' : 'removeAccess')}
              </button>
              <button type="button" className="px-3 py-1.5 text-sm" onClick={() => setConfirming(false)} disabled={pending}>
                {t(lang, 'cancel')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="intent"
                value={isRequest ? 'grant' : 'update'}
                disabled={!ready || pending}
                className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pending ? t(lang, 'sending') : t(lang, isRequest ? 'grant' : 'save')}
              </button>
              <button type="button" className="rounded-md px-4 py-2 text-red-700 dark:text-red-400" onClick={() => setConfirming(true)} disabled={pending}>
                {t(lang, isRequest ? 'decline' : 'removeAccess')}
              </button>
              <button type="button" className="rounded-md px-4 py-2" onClick={() => setOpen(false)} disabled={pending}>
                {t(lang, 'cancel')}
              </button>
            </div>
          )}
        </form>
      )}
    </li>
  );
}
