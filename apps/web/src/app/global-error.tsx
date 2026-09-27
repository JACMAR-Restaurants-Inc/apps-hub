'use client';

import './globals.css';

/**
 * The last resort: the root layout itself failed, so this page brings its own <html>
 * and <body> and cannot rely on the layout's font or language. French, with English
 * beneath, since the language cookie is not worth risking here.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr">
      <body className="shell">
        <title>JM Portal</title>
        <main className="wrap stack" style={{ marginTop: 40 }}>
          <div className="card warn" role="alert">
            <h2>Une erreur est survenue</h2>
            <p>Le portail n’a pas pu se charger. Réessayez dans un instant.</p>
            <p lang="en">Something went wrong. The portal could not load. Try again in a moment.</p>
            <div className="askrow">
              <button type="button" className="btn-go" style={{ width: 'auto' }} onClick={() => retry()}>
                Réessayer / Try again
              </button>
            </div>
            {error.digest && (
              <p className="fine" style={{ marginTop: 13 }}>
                Code&nbsp;: <b>{error.digest}</b>
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
