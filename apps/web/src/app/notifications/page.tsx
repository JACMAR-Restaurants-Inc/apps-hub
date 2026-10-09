import { MarkRead } from '@/components/mark-read';
import { Footer, TopBar } from '@/components/top-bar';
import { betaApp } from '@/lib/beta/apps';
import { appUrl, catalogueApp } from '@/lib/catalogue';
import { db } from '@/lib/db';
import { loadHome, loadMyRequests } from '@/lib/home-data';
import { formatDay, t, type Lang } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { listNotifications, type NotificationRow } from '@/lib/notifications';
import { listRestaurants } from '@/lib/restaurants';
import { getViewer } from '@/lib/viewer';
import { redirect } from 'next/navigation';
import { roleLabel } from '@/lib/labels';

/**
 * Notifications (owner, 2026-09-29), in place of the Demandes page: first the person's
 * requests still waiting, then what the office decided (granted, changed, declined),
 * newest first, the unread ones marked "Nouveau". Opening the page marks them read.
 */
export default async function NotificationsPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');

  const [home, pending, notes, stores] = await Promise.all([loadHome(viewer, lang), loadMyRequests(viewer, lang), listNotifications(db(), viewer.email), listRestaurants()]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const unread = notes.some((n) => !n.readAt);

  return (
    <>
      <TopBar lang={lang} viewer={home.bar} />
      <main id="main" className="page" lang={lang}>
        <div className="pagehead">
          <h1>{t(lang, 'notificationsTitle')}</h1>
          <p>{t(lang, 'notificationsLine')}</p>
        </div>

        {pending.length > 0 && (
          <section className="notesec">
            <h2>{t(lang, 'pendingTitle')}</h2>
            <ul className="reqlist">
              {pending.map((r) => (
                <li key={r.key} className="note pending">
                  <b>{r.name}</b>
                  <span>{t(lang, 'pendingLine').replace('{date}', r.day)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="notesec">
          <h2>{t(lang, 'notifTitle')}</h2>
          {notes.length === 0 ? (
            <p className="favempty">{t(lang, 'notifNone')}</p>
          ) : (
            <ul className="reqlist">
              {notes.map((n) => (
                <Note key={n.id} lang={lang} n={n} storeName={storeName} />
              ))}
            </ul>
          )}
          {notes.length > 0 && <p className="notekept">{t(lang, 'notifKept')}</p>}
        </section>
        {unread && <MarkRead />}
      </main>
      <Footer lang={lang} />
    </>
  );
}

function Note({ lang, n, storeName }: { lang: Lang; n: NotificationRow; storeName: Map<string, string> }) {
  const app = catalogueApp(n.app);
  // An invitation to test names a beta app, which is not in the catalogue.
  const beta = n.kind === 'testing' ? betaApp(n.app) : undefined;
  const named = app ?? beta;
  const appName = named ? (lang === 'fr' ? named.nameFr : named.name) : n.app;
  const form = n.kind === 'form' && n.detail && 'formId' in n.detail ? n.detail : null;
  const access = n.detail && 'role' in n.detail ? n.detail : null;
  const title = form
    ? t(lang, 'notifForm').replace('{form}', form.title)
    : t(lang, n.kind === 'granted' ? 'notifGranted' : n.kind === 'changed' ? 'notifChanged' : n.kind === 'testing' ? 'notifTesting' : 'notifDeclined').replace('{app}', appName);
  const role = access ? roleLabel(lang, access.role) : null;
  const where = access ? access.stores.map((s) => storeName.get(s) ?? s).join(', ') : '';
  // A beta that has since gone live, or been withdrawn, has no door here. A form's door
  // is the form itself: if it is no longer shared with them, its page says so.
  const url = form ? `/forms/${form.formId}` : n.kind === 'testing' ? (beta ? beta.path : null) : app ? appUrl(app) : null;
  return (
    <li className={`note ${n.kind}${n.readAt ? '' : ' unread'}`}>
      <div className="notebody">
        <b>
          {!n.readAt && <span className="notenew">{t(lang, 'notifNew')}</span>}
          {title}
        </b>
        {role && (
          <span>
            {n.kind === 'changed' ? `${t(lang, 'notifNow')} ` : ''}
            {role}
            {where ? ` · ${where}` : ''}
          </span>
        )}
        {n.kind === 'declined' && <span>{t(lang, 'notifDeclinedHint')}</span>}
        {n.kind === 'testing' && <span>{t(lang, 'notifTestingHint')}</span>}
        {form && <span>{t(lang, 'notifFormHint')}</span>}
        <span className="noteday">{formatDay(lang, n.createdAt)}</span>
      </div>
      {n.kind !== 'declined' && url && (
        <a className="pbtn noteopen" href={url}>
          {t(lang, form ? 'notifFormOpen' : 'openApp')}
        </a>
      )}
    </li>
  );
}
