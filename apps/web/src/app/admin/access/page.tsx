import { GrantPanel, type PanelPerson } from '@/components/grant-panel';
import { Header } from '@/components/header';
import { formatDay, t, type Lang } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { appByKey } from '@/lib/requests/apps';
import { directory, type DirectoryEntry } from '@/lib/requests/queries';
import { getViewer } from '@/lib/viewer';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Access requests and the people who have access (RBAC §48). System admins only. The
 * page hiding itself is courtesy; the protection is requireSystemAdmin in every action.
 */
export default async function AccessPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (viewer?.standing !== 'admin') notFound();

  const d = await directory();
  const open = d.restaurants.filter((r) => r.active);
  const person = (e: DirectoryEntry, l: Lang): PanelPerson => ({
    app: e.app,
    appName: appByKey(e.app)?.name[l] ?? e.app,
    email: e.email,
    status: e.status,
    role: e.role,
    stores: e.stores,
    fullName: e.fullName,
    hrEmail: e.hrEmail,
    employeeNumber: e.employeeNumber,
    clearviewStore: e.clearviewStore,
    since: formatDay(l, e.since),
    askedAgain: e.status === 'pending' && e.grantedBy !== null,
  });

  return (
    <>
      <Header lang={lang} signedIn />
      <main lang={lang} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          {t(lang, 'backToPortal')}
        </Link>

        <section aria-labelledby="requests" className="space-y-3">
          <h1 id="requests" className="text-2xl font-semibold">
            {t(lang, 'accessRequests')}
          </h1>
          {d.requests.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t(lang, 'noRequests')}</p>
          ) : (
            <ul className="space-y-3">
              {d.requests.map((e) => (
                <GrantPanel key={`${e.app}|${e.email}|${e.since.getTime()}`} lang={lang} person={person(e, lang)} roles={d.rolesByApp[e.app] ?? []} restaurants={open} />
              ))}
            </ul>
          )}
        </section>

        {d.members.length > 0 && (
          <section aria-labelledby="people" className="space-y-3">
            <h2 id="people" className="text-lg font-semibold">
              {t(lang, 'people')}
            </h2>
            <ul className="space-y-3">
              {d.members.map((e) => (
                <GrantPanel key={`${e.app}|${e.email}|${e.since.getTime()}`} lang={lang} person={person(e, lang)} roles={d.rolesByApp[e.app] ?? []} restaurants={open} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
