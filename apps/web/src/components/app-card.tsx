'use client';

import { requestAccessAction, type RequestState } from '@/app/actions';
import { t, type Key, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useActionState, useState } from 'react';

export type CardState =
  | { kind: 'held'; href: string }
  | { kind: 'waiting'; since: string }
  | { kind: 'askable' }
  /** Holds it, but their switch is off: asking again would only say "already asked". */
  | { kind: 'off' };

/**
 * One app, and where the person stands with it, in the same place on every card
 * (RBAC §45): held -> Open; asked -> Requested, waiting, with the day; otherwise
 * Request access. Asking takes two taps, so a stray one emails nobody.
 */
export function AppCard(props: { lang: Lang; appKey: string; name: string; description: string; state: CardState }) {
  const { lang, appKey, name, description, state } = props;
  const [asking, setAsking] = useState(false);
  const [result, formAction, pending] = useActionState<RequestState, FormData>(requestAccessAction, {
    outcome: null,
    employeeNumber: '',
  });

  const waiting = state.kind === 'waiting' || result.outcome === 'pending' || result.outcome === 'duplicate';
  const refusal: Key | null =
    result.outcome === 'employee_required' || result.outcome === 'employee_not_found' || result.outcome === 'clearview_unavailable'
      ? result.outcome
      : result.outcome === 'error' || result.outcome === 'unknown_app' || result.outcome === 'not_signed_in'
        ? 'requestFailed'
        : null;
  const fieldId = `emp-${appKey}`;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="font-semibold">{name}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>

      {state.kind === 'held' ? (
        <Link
          href={state.href}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {t(lang, 'open')}
        </Link>
      ) : state.kind === 'off' ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(lang, 'inactive')}</p>
      ) : waiting ? (
        <p className="text-sm" role="status">
          {t(lang, 'requested')}
          {state.kind === 'waiting' && (
            <span className="block text-zinc-600 dark:text-zinc-400">
              {t(lang, 'requestedOn')}
              {state.since}
            </span>
          )}
        </p>
      ) : !asking ? (
        <button
          type="button"
          className="self-start rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          onClick={() => setAsking(true)}
        >
          {t(lang, 'requestAccess')}
        </button>
      ) : (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="app" value={appKey} />
          <label htmlFor={fieldId} className="text-sm font-medium">
            {t(lang, 'employeeNumber')}
          </label>
          <input
            id={fieldId}
            name="employeeNumber"
            inputMode="numeric"
            autoComplete="off"
            required
            defaultValue={result.employeeNumber}
            aria-describedby={`${fieldId}-help${refusal ? ` ${fieldId}-error` : ''}`}
            aria-invalid={refusal ? true : undefined}
            className="w-40 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p id={`${fieldId}-help`} className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(lang, 'employeeNumberHelp')}
          </p>
          {refusal && (
            <p id={`${fieldId}-error`} role="alert" className="text-sm text-red-700 dark:text-red-400">
              {t(lang, refusal)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? t(lang, 'sending') : t(lang, 'send')}
            </button>
            <button type="button" disabled={pending} className="rounded-md px-4 py-2" onClick={() => setAsking(false)}>
              {t(lang, 'cancel')}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
