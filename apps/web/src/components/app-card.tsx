'use client';

import { requestAccessAction, type RequestState } from '@/app/actions';
import type { HomeCard } from '@/lib/home';
import { t, type Key, type Lang } from '@/lib/i18n';
import { useActionState, useState } from 'react';
import { ArchesSvg } from './arches';
import { SessionExpired } from './session-expired';

/**
 * One app, the Apps Script portal's card (Cards.html; §45/§55/§76/§82). The foot says
 * where the person stands, in the same place on every card:
 *   held     Ouvrir l'application ↗ / Ouvrir ↗, filled: it is the action
 *   pending  Demandé · en attente du bureau, with the date asked
 *   revoked  "Your access was removed. You can ask again." then Request access
 *   askable  Demander l'accès, outlined, two taps so a stray one emails nobody
 */
export function AppCard({ lang, card }: { lang: Lang; card: HomeCard }) {
  const [asking, setAsking] = useState(false);
  const [result, formAction, pending] = useActionState<RequestState, FormData>(requestAccessAction, {
    outcome: null,
    employeeNumber: '',
  });
  const name = lang === 'fr' ? card.nameFr : card.name;

  // Once a request is saved (or was already there) the card is waiting, without a reload.
  const sent = result.outcome === 'pending' || result.outcome === 'duplicate';
  const state = sent ? 'pending' : card.state;
  const refusal: Key | null =
    result.outcome === 'employee_required' || result.outcome === 'employee_not_found' || result.outcome === 'clearview_unavailable'
      ? result.outcome
      : result.outcome === 'not_signed_in'
        ? 'errSession'
        : result.outcome === 'error' || result.outcome === 'unknown_app'
          ? 'requestFailed'
        : null;
  const fieldId = `emp-${card.key}`;

  return (
    <article className={`app${state === 'pending' ? ' pending' : ''}`} id={`app-${card.key}`}>
      <div className="apptop">
        {card.logo === 'arches' ? (
          <span className="applogo arches">
            <ArchesSvg />
          </span>
        ) : card.logo ? (
          <span className={`applogo ${card.logo}`} aria-hidden="true" />
        ) : (
          <div className="sq s40" style={{ background: card.tint ?? undefined, color: card.ink ?? undefined }} aria-hidden="true">
            {card.mark}
          </div>
        )}
        <h3>
          <span>{name}</span>
          {card.adminOnly && <span className="mini">{t(lang, 'adminsOnly')}</span>}
        </h3>
      </div>
      <p className="bl">{lang === 'fr' ? card.blurbFr : card.blurb}</p>
      <div className="appfoot">
        {state === 'held' ? (
          !card.url ? (
            <span className="soon">{t(lang, 'notConnected')}</span>
          ) : (
            <a
              className="btn-go"
              href={card.url}
              {...(card.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span>{t(lang, card.label === 'open' ? 'open' : 'openApp')}</span>
              <span aria-hidden="true">↗</span>
              {card.newTab && <span className="sr-only"> {t(lang, 'opensNewTab')}</span>}
            </a>
          )
        ) : state === 'pending' ? (
          <>
            <div className="waiting" role="status">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              <span>{t(lang, 'requested')}</span>
              {card.askedAt && !sent && <small>{card.askedAt}</small>}
            </div>
            {sent && <p className="sent">{t(lang, 'requestSent')}</p>}
          </>
        ) : asking ? (
          <form className="askbox" action={formAction}>
            <p>{t(lang, 'askQuestion').replace('{app}', name)}</p>
            <input type="hidden" name="app" value={card.key} />
            <label htmlFor={fieldId}>
              {t(lang, 'employeeNumber')}
              <input
                id={fieldId}
                name="employeeNumber"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={result.employeeNumber}
                aria-describedby={`${fieldId}-hint${refusal ? ` ${fieldId}-err` : ''}`}
                aria-invalid={refusal ? true : undefined}
                autoFocus
              />
              <span className="hint" id={`${fieldId}-hint`}>
                {t(lang, 'employeeNumberHelp')}
              </span>
            </label>
            {refusal === 'errSession' ? (
              <SessionExpired lang={lang} className="askerr" />
            ) : (
              refusal && (
                <p className="askerr" id={`${fieldId}-err`} role="alert">
                  {t(lang, refusal)}
                </p>
              )
            )}
            <div className="askrow">
              <button type="submit" className="btn-go" disabled={pending}>
                {pending ? t(lang, 'sending') : t(lang, 'send')}
              </button>
              <button type="button" className="btn-x" disabled={pending} onClick={() => setAsking(false)}>
                {t(lang, 'cancel')}
              </button>
            </div>
          </form>
        ) : (
          <>
            {state === 'revoked' && <p className="gone">{t(lang, 'accessRemoved')}</p>}
            <button type="button" className="btn-ask" onClick={() => setAsking(true)}>
              {t(lang, 'requestAccess')}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
