import { Footer, TopBar } from '@/components/top-bar';
import { AccessDenied, authorizeBeta } from '@/lib/access';
import { baseName, betaApp } from '@/lib/beta/apps';
import { betaDecision } from '@/lib/beta/rules';
import { isTester } from '@/lib/beta/testers';
import { db } from '@/lib/db';
import { loadBar } from '@/lib/home-data';
import { t, type Key } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster, getViewer } from '@/lib/viewer';
import { isSystemAdmin, memberKey } from '@hub/rbac';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const KEY = 'BetaDemo';
const ROLE_KEY: Record<string, Key> = { office: 'role_office', manager: 'role_manager', viewer: 'role_viewer' };

/**
 * The placeholder beta (owner, 2026-09-30), until the first real one moves in: it shows
 * a tester what a beta knows of them (the live app's role and restaurants) and asks
 * betaDecision, restaurant by restaurant, whether they could file a count. Delete it,
 * and its entry in lib/beta/apps.ts, when the real beta arrives.
 */
export default async function BetaDemoPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  try {
    await authorizeBeta(KEY, 'app', 'access');
  } catch (e) {
    // Not a tester, or no longer holds the live app: not found, as for a file.
    if (e instanceof AccessDenied) notFound();
    throw e;
  }

  const beta = betaApp(KEY)!;
  const [bar, roster, stores, tester] = await Promise.all([loadBar(viewer), getRoster(), listRestaurants(), isTester(db(), viewer.email, KEY)]);
  const admin = isSystemAdmin(roster, viewer.email);
  const member = roster.members.get(memberKey(beta.base, viewer.email));
  const role = member?.role ? t(lang, ROLE_KEY[member.role] ?? 'role_viewer') : null;
  const open = stores.filter((s) => s.active);
  const held = open.filter((s) => member?.stores.has(s.id));

  return (
    <>
      <TopBar lang={lang} viewer={bar} />
      <main id="main" className="page" lang={lang}>
        <div className="pagehead">
          <Link href="/tests" className="backlink">
            ← {t(lang, 'testsTitle')}
          </Link>
          <h1>
            {lang === 'fr' ? beta.nameFr : beta.name} <span className="mini">{t(lang, 'betaBadge')}</span>
          </h1>
          <p>{t(lang, 'demoLine')}</p>
        </div>
        <section className="panel betademo">
          <div className="ph">
            <h2>{t(lang, 'demoTestingAs').replace('{app}', baseName(beta, lang))}</h2>
          </div>
          {admin ? (
            <p>{t(lang, 'demoAdmin')}</p>
          ) : (
            <dl>
              <dt>{t(lang, 'role')}</dt>
              <dd>{role ?? '·'}</dd>
              <dt>{t(lang, 'restaurants')}</dt>
              <dd>{held.map((s) => `${s.id} - ${s.name}`).join(', ') || '·'}</dd>
            </dl>
          )}
        </section>
        <section className="panel betademo">
          <div className="ph">
            <h2>{t(lang, 'demoCheck')}</h2>
          </div>
          <dl>
            {open.map((s) => {
              const ok = betaDecision(roster, viewer.email, tester, KEY, 'count', 'create', s.id).allowed;
              return [
                <dt key={`${s.id}-t`}>{`${s.id} - ${s.name}`}</dt>,
                <dd key={`${s.id}-d`}>
                  <span className={`pill ${ok ? 'on' : 'off'}`}>{t(lang, ok ? 'demoYes' : 'demoNo')}</span>
                </dd>,
              ];
            })}
          </dl>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
