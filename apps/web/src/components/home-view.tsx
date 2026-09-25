'use client';

import type { CategoryKey, Group } from '@/lib/catalogue';
import { fold, greetingPart, type HomeSection } from '@/lib/home';
import { t, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { AppCard } from './app-card';

export interface HomeHead {
  none: boolean;
  isAdmin: boolean;
  email: string;
  firstName: string;
  /** From the server, in Toronto time; corrected from the device's clock (§54). */
  greeting: 'morning' | 'afternoon' | 'evening';
  stores: { id: string; name: string }[];
  myWaiting: number;
  admin: { waiting: number; people: number; restaurants: number } | null;
}

const GREET = {
  morning: { fr: 'Bonjour', en: 'Good morning' },
  afternoon: { fr: 'Bon après-midi', en: 'Good afternoon' },
  evening: { fr: 'Bonsoir', en: 'Good evening' },
} as const;

/**
 * The home page and the two group pages (§45/§51/§57), from Ui.html, Home.html and
 * Cards.html. On a group page only that group shows, with its own title and count,
 * and no welcome, figures or banner (§57/§64).
 */
export function HomeView(props: {
  lang: Lang;
  head: HomeHead;
  sections: HomeSection[];
  categories: { key: CategoryKey; name: string; nameFr: string; count: number }[];
  group: Group | null;
}) {
  const { lang, head, group } = props;
  const router = useRouter();
  const sections = group ? props.sections.filter((s) => s.kind === group) : props.sections;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryKey | ''>('');
  // The server said morning/afternoon/evening in Toronto, for the first paint; the
  // device's own clock wins once the page runs (§54).
  const greeting = useSyncExternalStore(
    noSubscribe,
    () => greetingPart(new Date().getHours()),
    () => head.greeting,
  );

  const pageCats = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    for (const s of sections) for (const c of s.cards) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    return props.categories.filter((c) => counts.has(c.key)).map((c) => ({ ...c, count: counts.get(c.key)! }));
  }, [sections, props.categories]);
  // A category with nothing on this page falls back to All (§61).
  const activeCat = pageCats.some((c) => c.key === cat) ? cat : '';

  const total = sections.reduce((n, s) => n + s.cards.length, 0);
  const showFinder = total >= 3; // §75: from three apps, for managers too
  const needle = fold(q.trim());
  const visible = sections.map((s) => ({
    ...s,
    shown: s.cards.filter((c) => (!needle || c.hay.includes(needle)) && (!activeCat || c.category === activeCat)),
  }));
  const shownTotal = visible.reduce((n, s) => n + s.shown.length, 0);
  const clear = () => {
    setQ('');
    setCat('');
  };
  const internalPage = props.sections.some((s) => s.kind === 'internal' && s.cards.length >= 2);
  const groupInfo = group ? props.sections.find((s) => s.kind === group) : null;

  return (
    <main id="main" className="page" lang={lang}>
      {group && groupInfo ? (
        <div className="pagehead">
          <h1>{lang === 'fr' ? groupInfo.nameFr : groupInfo.name}</h1>
          <p>{t(lang, group === 'internal' ? 'groupInternalLine' : 'groupExternalLine')}</p>
          <p className="pgcount">{t(lang, 'appCount').replace('{n}', String(shownTotal))}</p>
        </div>
      ) : (
        <>
          <div className="welcome">
            <div>
              {head.none ? (
                <>
                  <h1>{t(lang, 'welcome')}</h1>
                  <p>{t(lang, 'welcomeBody')}</p>
                </>
              ) : (
                <>
                  <h1>
                    <span>{GREET[greeting][lang] + (head.firstName ? `, ${head.firstName}` : '')}</span>
                    <span className="wave" aria-hidden="true">
                      👋
                    </span>
                  </h1>
                  <p>
                    {t(
                      lang,
                      head.isAdmin
                        ? 'subAdmin'
                        : head.stores.length === 1
                          ? 'subOneStore'
                          : head.stores.length > 1
                            ? 'subStores'
                            : 'subApps',
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {head.none ? (
            <div className="banner" role="note">
              <div className="bi" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="8" cy="15" r="3.5" />
                  <path d="M10.5 12.5 19 4M16 7l2.5 2.5M14 9l2 2" />
                </svg>
              </div>
              <div>
                <h2>{t(lang, 'noGrantsTitle')}</h2>
                <p>
                  {t(lang, 'signedInAsLong')} <b>{head.email}</b>. {t(lang, 'noGrantsBody')}
                </p>
                <SwitchAccount lang={lang} />
              </div>
            </div>
          ) : (
            <div className="stats">
              <StatCard
                className="stat blue"
                onClick={internalPage ? () => router.push('/apps/internal') : undefined}
                k={t(lang, 'statApps')}
                v={String(props.sections.reduce((n, s) => n + s.cards.filter((c) => c.state === 'held').length, 0))}
                s={t(lang, 'statAppsSub')}
              />
              {head.admin ? (
                <>
                  <div className="stat pink">
                    <div className="k">
                      <span>{t(lang, 'statWaiting')}</span>
                      {head.admin.waiting > 0 && <span className="tag">{t(lang, 'toReview')}</span>}
                    </div>
                    <div className="v">{head.admin.waiting}</div>
                    <div className="s">{t(lang, 'statWaitingSub')}</div>
                    <div className="rule" />
                  </div>
                  <StatCard
                    className="stat orange"
                    onClick={() => router.push('/admin/access')}
                    k={t(lang, 'statPeople')}
                    v={String(head.admin.people)}
                    s={head.admin.restaurants === 1 ? t(lang, 'statPeopleSubOne') : t(lang, 'statPeopleSub').replace('{n}', String(head.admin.restaurants))}
                  />
                </>
              ) : (
                <>
                  {head.stores.length === 1 && (
                    <StatCard className="stat green" k={t(lang, 'statStore')} v={head.stores[0]!.name} s={`Restaurant ${head.stores[0]!.id}`} />
                  )}
                  {head.stores.length > 1 && (
                    <StatCard
                      className="stat green"
                      k={t(lang, 'statStores')}
                      v={String(head.stores.length)}
                      s={head.stores.map((x) => `${x.id} - ${x.name}`).join(', ')}
                    />
                  )}
                  {head.myWaiting > 0 && (
                    <StatCard className="stat orange" k={t(lang, 'statMyRequests')} v={String(head.myWaiting)} s={t(lang, 'statMyRequestsSub')} />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {showFinder && (
        <div className="finder" role="search">
          <label className="searchbox">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
            <input
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(lang, 'searchApps')}
              aria-label={t(lang, 'searchApps')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            />
          </label>
          <select
            className="storefilter catpick"
            aria-label={t(lang, 'category')}
            value={activeCat}
            onChange={(e) => setCat(e.target.value as CategoryKey | '')}
          >
            <option value="">{t(lang, 'allCategories')}</option>
            {pageCats.map((c) => (
              <option key={c.key} value={c.key}>
                {(lang === 'fr' ? c.nameFr : c.name) + ` (${c.count})`}
              </option>
            ))}
          </select>
        </div>
      )}

      {visible.map((s) =>
        s.shown.length === 0 ? null : (
          <section className="appsec" id={`sec-${s.kind}`} key={s.kind}>
            {!group && (
              <div className="ph">
                <div>
                  <h2>
                    <span>{lang === 'fr' ? s.nameFr : s.name}</span>
                    <span className="cnt">{s.shown.length}</span>
                  </h2>
                  <p>
                    <span>{t(lang, s.kind === 'internal' ? 'secInternalLine' : 'secExternalLine')}</span>
                    {s.canAsk && <span> {t(lang, 'secCanAsk')}</span>}
                  </p>
                </div>
                {s.cards.length >= 2 && (
                  <Link href={`/apps/${s.kind}`} className="viewall">
                    <span>{t(lang, 'viewAll')}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            )}
            <div className="appgrid">
              {s.shown.map((c) => (
                <AppCard key={c.key} lang={lang} card={c} />
              ))}
            </div>
          </section>
        ),
      )}

      {showFinder && shownTotal === 0 && (
        <div className="nomatch">
          <p>{t(lang, 'noMatch')}</p>
          <button type="button" className="btn-ask" onClick={clear}>
            {t(lang, 'clearSearch')}
          </button>
        </div>
      )}
    </main>
  );
}

const noSubscribe = () => () => {};

/** A summary card: a button only where it leads somewhere (§26/§63). */
function StatCard(props: { className: string; k: string; v: string; s: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="k">
        <span>{props.k}</span>
      </div>
      <div className="v">{props.v}</div>
      <div className="s">{props.s}</div>
      <div className="rule" />
    </>
  );
  return props.onClick ? (
    <button type="button" className={props.className} onClick={props.onClick}>
      {body}
    </button>
  ) : (
    <div className={props.className}>{body}</div>
  );
}

/** "Not you?": signs out here, then Google asks which account (select_account). */
function SwitchAccount({ lang }: { lang: Lang }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="switchacct"
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
      onClick={async () => {
        const { authClient } = await import('@/lib/auth-client');
        await authClient.signOut();
        await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
        router.refresh();
      }}
    >
      {t(lang, 'switchAccount')}
    </button>
  );
}
