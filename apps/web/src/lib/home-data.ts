import 'server-only';
import { appMembers, memberStores, restaurants, users } from '@hub/db';
import { and, eq } from 'drizzle-orm';
import type { BarViewer } from '@/components/top-bar';
import type { HomeHead } from '@/components/home-view';
import { db } from './db';
import { formatDay, type Lang } from './i18n';
import { catalogueApp } from './catalogue';
import { listFavourites } from './favourites';
import { favouriteCards, greetingPart, holdsNothing, homeCards, initials, pageCategories, prettyFirstName, torontoHour } from './home';
import { directory } from './requests/queries';
import { getRoster, type Viewer } from './viewer';

/**
 * Everything the signed-in shell and the home page need, loaded once. Reads for
 * drawing only: every action still asks can() for itself.
 */
export async function loadHome(viewer: Viewer, lang: Lang) {
  const isAdmin = viewer.standing === 'admin';
  const [roster, mine, person, adminDir, stars] = await Promise.all([
    getRoster(),
    db()
      .select({ app: appMembers.app, status: appMembers.status, since: appMembers.lastModified, role: appMembers.role })
      .from(appMembers)
      .where(eq(appMembers.email, viewer.email)),
    db().select({ fullName: users.fullName }).from(users).where(eq(users.email, viewer.email)).limit(1),
    isAdmin ? directory() : Promise.resolve(null),
    listFavourites(db(), viewer.email),
  ]);
  const personActive = roster.users.get(viewer.email)?.active === true;

  const cards = homeCards({
    isAdmin,
    personActive,
    memberships: mine,
    formatDay: (d) => formatDay(lang, d),
    favourites: stars,
  });

  // The restaurants a manager holds in Cash Balancing, for "Votre restaurant".
  const cash = mine.find((m) => m.app === 'SafeCount' && m.status === 'active');
  const stores =
    !isAdmin && cash && personActive
      ? await db()
          .select({ id: restaurants.restaurantId, name: restaurants.name })
          .from(memberStores)
          .innerJoin(restaurants, eq(restaurants.restaurantId, memberStores.restaurantId))
          .where(and(eq(memberStores.app, 'SafeCount'), eq(memberStores.email, viewer.email)))
      : [];

  const waiting = adminDir?.requests.length ?? 0;
  const activeMembers = adminDir?.members.filter((m) => m.status === 'active' && m.personActive) ?? [];
  const head: HomeHead = {
    none: holdsNothing(isAdmin, cards),
    isAdmin,
    email: viewer.email,
    firstName: prettyFirstName(person[0]?.fullName ?? viewer.name),
    greeting: greetingPart(torontoHour()),
    stores: stores.sort((a, b) => a.id.localeCompare(b.id)),
    admin: adminDir
      ? {
          waiting,
          people: new Set(activeMembers.map((m) => m.email)).size,
          restaurants: new Set(activeMembers.flatMap((m) => m.stores)).size,
        }
      : null,
  };

  // The label beside the initials: Admin, or their role in Cash Balancing.
  const role = isAdmin ? 'admin' : cash && personActive ? cash.role : null;
  const bar: BarViewer = {
    email: viewer.email,
    initials: initials(person[0]?.fullName ?? viewer.name, viewer.email),
    role: role ?? null,
    isAdmin,
    // An admin's badge is the office's queue; anyone else's is their own requests.
    waiting: isAdmin ? waiting : mine.filter((m) => m.status === 'pending').length,
  };

  return {
    cards,
    // Only the keys that are cards for this person, in the order starred.
    favourites: favouriteCards(cards, stars).map((c) => c.key),
    categories: pageCategories(cards),
    head,
    bar,
  };
}

/** The signed-in person's pending requests, oldest first, for the Demandes page. */
export async function loadMyRequests(viewer: Viewer, lang: Lang) {
  const rows = await db()
    .select({ app: appMembers.app, since: appMembers.lastModified })
    .from(appMembers)
    .where(and(eq(appMembers.email, viewer.email), eq(appMembers.status, 'pending')))
    .orderBy(appMembers.lastModified);
  return rows.map((r) => {
    const a = catalogueApp(r.app);
    return { key: r.app, name: a ? (lang === 'fr' ? a.nameFr : a.name) : r.app, day: formatDay(lang, r.since) };
  });
}
