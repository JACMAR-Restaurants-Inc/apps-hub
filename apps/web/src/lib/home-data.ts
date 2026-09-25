import 'server-only';
import { appMembers, memberStores, restaurants, users } from '@hub/db';
import { and, eq } from 'drizzle-orm';
import type { BarViewer } from '@/components/top-bar';
import type { HomeHead } from '@/components/home-view';
import { db } from './db';
import { formatDay, type Lang } from './i18n';
import { greetingPart, holdsNothing, homeSections, initials, pageCategories, prettyFirstName, torontoHour, type HomeSection } from './home';
import { directory } from './requests/queries';
import { getRoster, type Viewer } from './viewer';

/**
 * Everything the signed-in shell and the home page need, loaded once. Reads for
 * drawing only: every action still asks can() for itself.
 */
export async function loadHome(viewer: Viewer, lang: Lang) {
  const isAdmin = viewer.standing === 'admin';
  const [roster, mine, person, adminDir] = await Promise.all([
    getRoster(),
    db()
      .select({ app: appMembers.app, status: appMembers.status, since: appMembers.lastModified, role: appMembers.role })
      .from(appMembers)
      .where(eq(appMembers.email, viewer.email)),
    db().select({ fullName: users.fullName }).from(users).where(eq(users.email, viewer.email)).limit(1),
    isAdmin ? directory() : Promise.resolve(null),
  ]);
  const personActive = roster.users.get(viewer.email)?.active === true;

  const sections: HomeSection[] = homeSections({
    isAdmin,
    personActive,
    memberships: mine,
    formatDay: (d) => formatDay(lang, d),
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
    none: holdsNothing(isAdmin, sections),
    isAdmin,
    email: viewer.email,
    firstName: prettyFirstName(person[0]?.fullName ?? viewer.name),
    greeting: greetingPart(torontoHour()),
    stores: stores.sort((a, b) => a.id.localeCompare(b.id)),
    myWaiting: mine.filter((m) => m.status === 'pending').length,
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
    waiting,
  };

  return { sections, categories: pageCategories(sections), head, bar };
}
