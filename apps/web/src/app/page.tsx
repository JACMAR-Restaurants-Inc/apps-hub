import { AppCard, type CardState } from '@/components/app-card';
import { Header } from '@/components/header';
import { formatDay, t } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { APPS } from '@/lib/requests/apps';
import { directory, myApps } from '@/lib/requests/queries';
import { getViewer } from '@/lib/viewer';
import Link from 'next/link';
import { SignInButton } from './sign-in-buttons';

/**
 * The portal: a catalogue. Everyone sees every app, and each card says where they stand
 * (RBAC §45). Signing in grants nothing; what a card offers comes from the roster.
 */
export default async function Home() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);

  if (!viewer) {
    return (
      <>
        <Header lang={lang} signedIn={false} />
        <main lang={lang} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
          <h1 className="text-2xl font-semibold">{t(lang, 'portal')}</h1>
          <p>{t(lang, 'signInIntro')}</p>
          <div>
            <SignInButton label={t(lang, 'signIn')} />
          </div>
        </main>
      </>
    );
  }

  const admin = viewer.standing === 'admin';
  const [mine, pendingCount] = await Promise.all([
    myApps(viewer.email),
    admin ? directory().then((d) => d.requests.length) : Promise.resolve(0),
  ]);

  // A request adds the person INACTIVE, so "inactive" alone means nothing is decided
  // yet. Only somebody holding an app while their switch is off has been switched off.
  const switchedOff = viewer.standing === 'inactive' && mine.some((m) => m.status === 'active');

  const cards = APPS.map((app) => {
    const m = mine.find((x) => x.key === app.key);
    // An admin holds every app (can() step 1). Otherwise only an active row with the
    // person switched on; a revoked row can ask again.
    const state: CardState =
      admin || (m?.status === 'active' && viewer.standing === 'active')
        ? { kind: 'held', href: app.path }
        : m?.status === 'active'
          ? { kind: 'off' }
          : m?.status === 'pending'
            ? { kind: 'waiting', since: m.since ? formatDay(lang, m.since) : '' }
            : { kind: 'askable' };
    return { app, state };
  });
  const holdsNothing = !admin && !switchedOff && cards.every((c) => c.state.kind !== 'held');

  return (
    <>
      <Header lang={lang} signedIn />
      <main lang={lang} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <section aria-labelledby="who" className="space-y-1">
          <h1 id="who" className="text-2xl font-semibold">
            {holdsNothing ? t(lang, 'welcome') : viewer.name}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(lang, 'signedInAs')} <strong>{viewer.email}</strong>
          </p>
          {holdsNothing && (
            <>
              <p>{t(lang, 'welcomeBody')}</p>
              {/* The likeliest reason for seeing nothing is the wrong Google account (RBAC §22). */}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(lang, 'wrongAccount')}</p>
            </>
          )}
          {switchedOff && (
            <p role="status" className="text-sm font-medium">
              {t(lang, 'inactive')}
            </p>
          )}
        </section>

        {admin && (
          <Link
            href="/admin/access"
            className="flex items-center justify-between rounded-lg border border-zinc-300 p-4 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {t(lang, 'accessRequests')}
            <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">{pendingCount}</span>
          </Link>
        )}

        <section aria-labelledby="apps" className="space-y-3">
          <h2 id="apps" className="text-lg font-semibold">
            {t(lang, 'apps')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {cards.map(({ app, state }) => (
              <AppCard key={app.key} lang={lang} appKey={app.key} name={app.name[lang]} description={app.description[lang]} state={state} />
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
