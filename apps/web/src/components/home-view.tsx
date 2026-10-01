'use client';

import { favouriteAction } from '@/app/actions';
import type { CategoryKey } from '@/lib/catalogue';
import { appsPageOrder, canAsk, fold, greetingPart, type HomeCard } from '@/lib/home';
import { t, type Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { AppCard } from './app-card';
import { InstallBanner } from './install';
import { restaurantLabel } from '@/lib/labels';

export interface HomeHead {
  none: boolean;
  isAdmin: boolean;
  email: string;
  firstName: string;
  /** From the server, in Toronto time; corrected from the device's clock (§54). */
  greeting: 'morning' | 'afternoon' | 'evening';
  stores: { id: string; name: string }[];
  admin: { waiting: number; people: number; restaurants: number } | null;
}

const GREET = {
  morning: { fr: 'Bonjour', en: 'Good morning' },
  afternoon: { fr: 'Bon après-midi', en: 'Good afternoon' },
  evening: { fr: 'Bonsoir', en: 'Good evening' },
} as const;

/**
 * Home and the Applications page (owner's redesign, 2026-09-26).
 * - Home: the greeting and figures (§54/§63), then Favoris, the starred apps in the
 *   order starred, then Applications, every app in one list with the search.
 * - /apps: the same list under its own title, no greeting, figures or Favoris.
 * A star changes at once and is saved behind it; if the save fails it goes back.
 */
export function HomeView(props: {
  lang: Lang;
  head: HomeHead;
  cards: HomeCard[];
  favourites: string[];
  categories: { key: CategoryKey; name: string; nameFr: string; count: number }[];
  page: 'home' | 'apps';
}) {
  const { lang, head, cards, page } = props;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryKey | ''>('');
  const [favs, setFavs] = useState(props.favourites);
  const [favError, setFavError] = useState(false);
  // The server said morning/afternoon/evening in Toronto, for the first paint; the
  // device's own clock wins once the page runs (§54).
  const greeting = useSyncExternalStore(
    noSubscribe,
    () => greetingPart(new Date().getHours()),
    () => head.greeting,
  );

  const star = async (key: string, on: boolean) => {
    const before = favs;
    setFavError(false);
    setFavs(on ? [...favs.filter((k) => k !== key), key] : favs.filter((k) => k !== key));
    const { outcome } = await favouriteAction(key, on).catch(() => ({ outcome: 'error' as const }));
    if (outcome === 'done') return;
    setFavs(before);
    // No session any more: the page redraws as the door.
    if (outcome === 'expired') router.refresh();
    else setFavError(true);
  };

  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);
  const favCards = favs.flatMap((k) => byKey.get(k) ?? []);
  const isFav = new Set(favs);

  const showFinder = cards.length >= 3; // §75: from three apps, for managers too
  // A category with nothing on this page falls back to All (§61).
  const activeCat = props.categories.some((c) => c.key === cat) ? cat : '';
  const needle = fold(q.trim());
  const matched = cards.filter((c) => (!needle || c.hay.includes(needle)) && (!activeCat || c.category === activeCat));
  // Applications: favourites first, then alphabetical (owner, 2026-09-29). Home keeps its order.
  const shown = page === 'apps' ? appsPageOrder(matched, isFav, lang) : matched;
  const clear = () => {
    setQ('');
    setCat('');
  };
  const card = (c: HomeCard) => (
    <AppCard key={c.key} lang={lang} card={c} favourite={isFav.has(c.key)} onStar={(on) => star(c.key, on)} />
  );

  return (
    <main id="main" className="page" lang={lang}>
      {page === 'apps' ? (
        <div className="pagehead">
          <h1>{t(lang, 'appsTitle')}</h1>
          <p>
            {t(lang, 'appsLine')}
            {canAsk(cards) && ` ${t(lang, 'secCanAsk')}`}
          </p>
          <p className="pgcount">{t(lang, 'appCount').replace('{n}', String(shown.length))}</p>
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
                onClick={() => router.push('/apps')}
                k={t(lang, 'statApps')}
                v={String(cards.filter((c) => c.state === 'held').length)}
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
                      s={head.stores.map((x) => restaurantLabel(x.id, x.name)).join(', ')}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Not for someone with nothing yet: an icon for an empty portal can wait. */}
          {!head.none && <InstallBanner lang={lang} />}

          <section className="appsec" id="sec-favourites">
            <div className="ph">
              <h2>
                <span>{t(lang, 'favTitle')}</span>
                {favCards.length > 0 && <span className="cnt">{favCards.length}</span>}
              </h2>
            </div>
            {favCards.length > 0 ? <div className="appgrid">{favCards.map(card)}</div> : <p className="favempty">{t(lang, 'favEmpty')}</p>}
          </section>
        </>
      )}

      {favError && (
        <p className="askerr" role="alert">
          {t(lang, 'favFailed')}
        </p>
      )}

      <section className="appsec" id="sec-apps">
        {page === 'home' && (
          <div className="ph">
            <div>
              <h2>
                <span>{t(lang, 'appsTitle')}</span>
                <span className="cnt">{shown.length}</span>
              </h2>
              <p>
                <span>{t(lang, 'appsLine')}</span>
                {canAsk(cards) && <span> {t(lang, 'secCanAsk')}</span>}
              </p>
            </div>
          </div>
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
              {props.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {(lang === 'fr' ? c.nameFr : c.name) + ` (${c.count})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {shown.length > 0 && <div className="appgrid">{shown.map(card)}</div>}

        {showFinder && shown.length === 0 && (
          <div className="nomatch">
            <p>{t(lang, 'noMatch')}</p>
            <button type="button" className="btn-ask" onClick={clear}>
              {t(lang, 'clearSearch')}
            </button>
          </div>
        )}
      </section>
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
