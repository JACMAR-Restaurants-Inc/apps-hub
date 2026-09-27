'use client';

import { langFrom, LANG_COOKIE, t } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * A page that failed to load (a database hiccup, a dropped connection): the old
 * portal's error card (Ui.html's error view: .card.warn, Try again) instead of the raw
 * error. Inside the root layout, so the page's own styles and fonts apply.
 *
 * `retry()` re-fetches and re-renders the page (this Next version's name; `reset` would
 * only re-render). The digest is the server log's identifier for this error: shown so
 * someone can quote it, never the message itself, which could leak internals.
 */
const noSubscribe = () => () => {};

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // The language cookie is readable here (it is not httpOnly); French by default,
  // which is also what the server renders.
  const lang = useSyncExternalStore(
    noSubscribe,
    () => langFrom(document.cookie.split('; ').find((c) => c.startsWith(`${LANG_COOKIE}=`))?.split('=')[1]),
    () => 'fr' as const,
  );
  useEffect(() => console.error(error), [error]);

  return (
    <main className="wrap stack" lang={lang} style={{ marginTop: 40 }}>
      <div className="brand" style={{ justifyContent: 'center' }}>
        <span className="pmark" aria-hidden="true" />
        <span className="pname">
          <b>JM</b> Portal
        </span>
      </div>
      <div className="card warn" role="alert">
        <h2>{t(lang, 'pageErrorTitle')}</h2>
        <p>{t(lang, 'pageErrorBody')}</p>
        <div className="askrow" style={{ alignItems: 'center' }}>
          <button type="button" className="btn-go" style={{ width: 'auto' }} onClick={() => retry()}>
            {t(lang, 'retry')}
          </button>
          <Link href="/" className="btn-x">
            {t(lang, 'backToPortal')}
          </Link>
        </div>
        {error.digest && (
          <p className="fine" style={{ marginTop: 13 }}>
            {t(lang, 'errorCode')} <b>{error.digest}</b>
          </p>
        )}
      </div>
    </main>
  );
}
