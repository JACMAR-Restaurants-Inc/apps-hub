'use client';

import { explainAction, settingsAction, type Check } from '@/app/actions';
import { dict, t, type Key, type Lang } from '@/lib/i18n';
import type { Role } from '@hub/rbac';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { GrantDrawer, type DrawerTarget } from './grant-drawer';

export interface DirApp {
  key: string;
  name: string;
  nameFr: string;
  status: 'pending' | 'active' | 'revoked' | null;
  role: Role | null;
  stores: string[];
  /** ISO: when the row last changed. */
  since: string | null;
}
export interface DirPerson {
  email: string;
  fullName: string | null;
  hrEmail: string | null;
  employeeNumber: string | null;
  clearviewStore: string | null;
  active: boolean;
  isAdmin: boolean;
  addedAt: string;
  addedBy: string | null;
  apps: DirApp[];
}
export interface DirData {
  people: DirPerson[];
  restaurants: { id: string; name: string; active: boolean }[];
  appInfo: { key: string; name: string; nameFr: string; roles: Role[]; help: Partial<Record<Role, { fr: string; en: string }>> }[];
  /** ISO: when the server read this. */
  fetchedAt: string;
}

const REFRESH_EVERY = 60_000; // while visible
const REFRESH_MIN_GAP = 20_000; // on coming back, so tab flicking is not a flood

/** "revoked" with no role never had access: it was a request turned down (§48, endedKey). */
const rowStatusKey = (a: DirApp): Key =>
  a.status === 'active' ? 'pillActive' : a.status === 'pending' ? 'pillPending' : a.role ? 'pillRevoked' : 'pillDeclined';

/** When every app row a person has has ended, the directory says so instead of "active". */
function endedKey(p: DirPerson): Key | null {
  if (p.isAdmin) return null;
  const rows = p.apps.filter((a) => a.status);
  if (!rows.length || !rows.every((a) => a.status === 'revoked')) return null;
  return rowStatusKey(rows[0]!);
}

function initialsOf(p: DirPerson) {
  const parts = String(p.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
  return (p.email[0] ?? '?').toUpperCase();
}

/**
 * The access directory (RBAC §48/§59/§62/§71), from the Apps Script portal's script:
 * one row per person, filterable, each opening onto its details, "What can they
 * actually do?" and the Grant panel. It refreshes itself (§48 @79) every minute while
 * on screen and when the tab comes back, never while a panel is open, and never
 * lets an older answer overwrite a newer one (the router keeps only the latest).
 */
export function Directory({ lang, data, me }: { lang: Lang; data: DirData; me: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [store, setStore] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState<Record<string, Check[] | 'loading' | 'failed'>>({});
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The kill switch: which person is being asked "are you sure?", and which is saving.
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastTry = useRef(0);

  const names = new Map(data.restaurants.map((r) => [r.id, r.name]));
  const storeLabel = (id: string) => (names.get(id) ? `${id} - ${names.get(id)}` : id);
  const roleName = (r: Role) => t(lang, `role_${r}`);
  const appName = (a: { name: string; nameFr: string }) => (lang === 'fr' ? a.nameFr : a.name);

  // Refresh: every minute while visible, and on coming back (at most every 20 s).
  const refresh = useCallback(
    (reason: 'tick' | 'visible') => {
      if (drawer || document.visibilityState !== 'visible') return;
      const since = Date.now() - lastTry.current;
      if (since < (reason === 'visible' ? REFRESH_MIN_GAP : REFRESH_EVERY)) return;
      lastTry.current = Date.now();
      router.refresh();
    },
    [drawer, router],
  );
  useEffect(() => {
    lastTry.current = Date.parse(data.fetchedAt);
  }, [data.fetchedAt]);
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      refresh('tick');
    }, 15_000);
    const onVis = () => refresh('visible');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const minutes = Math.floor((now - Date.parse(data.fetchedAt)) / 60_000);
  const needle = q.toLowerCase().trim();
  const shown = data.people.filter(
    (p) =>
      (!needle || `${p.email} ${p.fullName ?? ''}`.toLowerCase().includes(needle)) &&
      (!store || p.apps.some((a) => a.stores.includes(store))),
  );

  const toggle = (email: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });

  const runExplain = async (email: string) => {
    setChecks((c) => ({ ...c, [email]: 'loading' }));
    try {
      const r = await explainAction(email);
      setChecks((c) => ({ ...c, [email]: Array.isArray(r) ? r : 'failed' }));
    } catch {
      setChecks((c) => ({ ...c, [email]: 'failed' }));
    }
  };

  const setActive = async (p: DirPerson, on: boolean) => {
    setSwitching(p.email);
    try {
      const { outcome } = await settingsAction('person_active', { email: p.email, on });
      setToast(outcome === 'done' ? t(lang, on ? 'toastSwitchedOn' : 'toastSwitchedOff') : t(lang, `out_${outcome}` as Key));
    } catch {
      setToast(t(lang, 'out_error'));
    }
    setSwitching(null);
    setConfirmOff(null);
    // The refresh brings a new fetchedAt, which resets the refresh timer.
    router.refresh();
  };

  const actionFor = (a: DirApp): 'review' | 'manage' | null =>
    a.status === 'pending' ? 'review' : a.status === 'active' ? 'manage' : null;
  const rowAction = (p: DirPerson) => {
    if (p.isAdmin) return null;
    const a = p.apps.find((x) => x.status === 'pending') ?? p.apps.find((x) => x.status === 'active');
    return a ? { app: a, kind: actionFor(a)! } : null;
  };
  const actionButton = (p: DirPerson, a: DirApp, kind: 'review' | 'manage', small = false) => (
    <button
      type="button"
      className={`rowbtn ${kind === 'review' ? 'go' : 'soft'}`}
      style={small ? { marginLeft: 8, padding: '4px 10px', fontSize: 12.5 } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        setDrawer({ email: p.email, app: a.key, mode: kind === 'review' ? 'grant' : 'manage' });
      }}
    >
      {t(lang, kind)}
    </button>
  );

  const roleCell = (p: DirPerson) => {
    if (p.isAdmin) return <span className="pill adm">{t(lang, 'pillAdmin')}</span>;
    const rows = p.apps.filter((a) => a.status);
    if (!rows.length) return <span>—</span>;
    const one = (a: DirApp) => (a.role ? roleName(a.role) : '—');
    const text = rows.length === 1 ? one(rows[0]!) : rows.map((a) => `${appName(a)}: ${one(a)}`).join(' · ');
    return rows.length === 1 && !rows[0]!.role ? <span>{text}</span> : <span className="rolename">{text}</span>;
  };
  const storesCell = (p: DirPerson): { dim: boolean; text: string } => {
    if (p.isAdmin) return { dim: true, text: t(lang, 'adminEverything') };
    const rows = p.apps.filter((a) => a.status);
    if (!rows.length) return { dim: true, text: t(lang, 'noAppRow') };
    const live = rows.filter((a) => a.status === 'active');
    if (!live.length) return { dim: true, text: t(lang, rowStatusKey(rows[0]!)) };
    const one = (a: DirApp) => (a.stores.length ? a.stores.map(storeLabel).join(', ') : t(lang, 'noRestaurants'));
    return { dim: false, text: live.length === 1 ? one(live[0]!) : live.map((a) => `${appName(a)}: ${one(a)}`).join(' · ') };
  };
  const checkLabel = (c: Check) =>
    c.kind === 'count' ? t(lang, 'chkCount') + storeLabel(c.storeId) : c.kind === 'admin_panel' ? t(lang, 'chkAdmin') : c.kind === 'consolidated' ? t(lang, 'chkConsol') : t(lang, 'chkApp');
  // Why can() said no, in words; a code we have no words for is shown as it is.
  const reasonText = (code: string) => {
    const k = `reason_${code}`;
    return k in dict ? t(lang, k as Key) : code;
  };
  const day = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    );

  return (
    <main id="roster" className="page" lang={lang}>
      <button type="button" className="backlink" onClick={() => router.push('/')}>
        <span aria-hidden="true">←</span> <span>{t(lang, 'navHome')}</span>
      </button>
      <div className="ph">
        <div>
          <h1 className="h1">
            <span>{t(lang, 'navDirectory')}</span>
          </h1>
        </div>
      </div>
      <p className="dirsub">{t(lang, 'dirSub')}</p>
      <p className="fresh" id="rosterFresh">
        {minutes < 1 ? t(lang, 'freshNow') : t(lang, 'freshMin').replace('{n}', String(minutes))}
      </p>

      {/* #rosterBody carries --dircols, the one column grid the header and the rows share (§71). */}
      {data.people.length === 0 ? (
        <p>{t(lang, 'nobody')}</p>
      ) : (
        <div id="rosterBody">
          <p className="sechead" style={{ marginBottom: 10 }}>
            {data.people.length === 1 ? t(lang, 'peopleCountOne') : t(lang, 'peopleCount').replace('{n}', String(data.people.length))}
          </p>
          <div className="dirtools">
            <input
              className="filter"
              type="search"
              placeholder={t(lang, 'filterPeople')}
              aria-label={t(lang, 'filterPeople')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="storefilter" aria-label={t(lang, 'allStores')} value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">{t(lang, 'allStores')}</option>
              {[...data.restaurants]
                .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {`${r.id} - ${r.name}`}
                  </option>
                ))}
            </select>
          </div>
          <div className="rhead" style={{ marginTop: 14 }}>
            <span>{t(lang, 'colName')}</span>
            <span>{t(lang, 'colEmail')}</span>
            <span>{t(lang, 'colState')}</span>
            <span>{t(lang, 'colRole')}</span>
            <span>{t(lang, 'colStores')}</span>
            <span />
          </div>
          <div className="people" id="plist" style={{ marginTop: 6 }}>
            {shown.map((p) => {
              const ended = endedKey(p);
              const stores = storesCell(p);
              const act = rowAction(p);
              const isOpen = open.has(p.email);
              const c = checks[p.email];
              return (
                <div
                  key={p.email}
                  className={`person${isOpen ? ' open' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggle(p.email)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggle(p.email);
                    }
                  }}
                >
                  <span className="av" aria-hidden="true">
                    {initialsOf(p)}
                  </span>
                  <span className={`c name${p.fullName ? '' : ' dim'}`}>{p.fullName ?? t(lang, 'noName')}</span>
                  <span className="c email">{p.email}</span>
                  <span className="c pills">
                    {ended ? (
                      <span className="pill off">{t(lang, ended)}</span>
                    ) : p.active || p.isAdmin ? (
                      <span className="pill on">{t(lang, 'pillActive')}</span>
                    ) : (
                      <span className="pill off">{t(lang, 'pillInactive')}</span>
                    )}
                    {p.apps.some((a) => a.status === 'pending') && <span className="pill wait">{t(lang, 'pillPending')}</span>}
                  </span>
                  <span className="metawrap">
                    <span className="c role">{roleCell(p)}</span>
                    <span className={`c stores${stores.dim ? ' dim' : ''}`}>{stores.text}</span>
                  </span>
                  <span className="c act">{act && actionButton(p, act.app, act.kind)}</span>
                  {isOpen && (
                    <div className="detail" onClick={(e) => e.stopPropagation()}>
                      <table className="dtl">
                        <tbody>
                          <tr>
                            <td>{t(lang, 'signsInWith')}</td>
                            <td>{p.email}</td>
                          </tr>
                          <tr>
                            <td>{t(lang, 'hrFile')}</td>
                            <td>{p.hrEmail ?? <span className="missing">{t(lang, 'hrMissing')}</span>}</td>
                          </tr>
                          <tr>
                            <td>{t(lang, 'addedOn')}</td>
                            <td>
                              {day(p.addedAt)}
                              {/* 'self-service request' is the code a request writes; say it in words. */}
                              {p.addedBy &&
                                ` ${t(lang, 'addedBy')} ${p.addedBy === 'self-service request' ? t(lang, 'selfService') : p.addedBy}`}
                            </td>
                          </tr>
                          {p.apps.map((a) => {
                            const k = p.isAdmin ? null : actionFor(a);
                            return (
                              <tr key={a.key}>
                                <td>{appName(a)}</td>
                                <td>
                                  {a.status ? (
                                    <>
                                      {t(lang, rowStatusKey(a))}
                                      {a.role && ` · ${roleName(a.role)}`}
                                      {' · '}
                                      {a.stores.length ? a.stores.map(storeLabel).join(', ') : t(lang, 'noRestaurants')}
                                    </>
                                  ) : (
                                    t(lang, 'noRow')
                                  )}
                                  {k && actionButton(p, a, k, true)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {/* The kill switch (RBAC §30/§31): every app at once. Not for an admin,
                          who bypasses it anyway, and not for yourself. */}
                      {!p.isAdmin && p.email !== me && (
                        <div style={{ margin: '12px 0 0' }}>
                          {confirmOff === p.email ? (
                            <div className="gp-confirm">
                              <p>{t(lang, 'confirmSwitchOff').replace('{who}', p.fullName ?? p.email)}</p>
                              <div className="askrow">
                                <button type="button" className="gp-btn no" disabled={switching === p.email} onClick={() => setActive(p, false)}>
                                  {switching === p.email ? t(lang, 'gpSaving') : t(lang, 'switchOff')}
                                </button>
                                <button type="button" className="gp-btn plain" disabled={switching === p.email} onClick={() => setConfirmOff(null)}>
                                  {t(lang, 'cancel')}
                                </button>
                              </div>
                            </div>
                          ) : p.active ? (
                            <button type="button" className="rowbtn soft" onClick={() => setConfirmOff(p.email)}>
                              {t(lang, 'switchOff')}
                            </button>
                          ) : (
                            <button type="button" className="rowbtn go" disabled={switching === p.email} onClick={() => setActive(p, true)}>
                              {switching === p.email ? t(lang, 'gpSaving') : t(lang, 'switchOn')}
                            </button>
                          )}
                        </div>
                      )}
                      <p style={{ margin: '12px 0 0' }}>
                        <button type="button" className="textlink" onClick={() => runExplain(p.email)}>
                          {t(lang, 'whatCan')}
                        </button>
                      </p>
                      {c === 'loading' && <p className="pending">{t(lang, 'checking')}</p>}
                      {c === 'failed' && <p>{t(lang, 'checkFailed')}</p>}
                      {Array.isArray(c) && (
                        <div className="explain">
                          <p className="sechead">{t(lang, 'decides')}</p>
                          <table className="exp">
                            <tbody>
                              {c.map((x, i) => (
                                <Fragment key={i}>
                                  <tr>
                                    <td>{checkLabel(x)}</td>
                                    <td>
                                      {x.allowed ? (
                                        <span className="verd y">{t(lang, 'yes')}</span>
                                      ) : (
                                        <span className="verd n">
                                          {t(lang, 'no')}: {reasonText(x.reason)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {shown.length === 0 && <p className="sub">{t(lang, 'nobodyMatches')}</p>}
          </div>
        </div>
      )}

      {drawer && (
        <GrantDrawer
          lang={lang}
          data={data}
          target={drawer}
          onClose={() => setDrawer(null)}
          onDone={(message) => {
            setDrawer(null);
            setToast(message);
            lastTry.current = Date.now();
            router.refresh();
          }}
        />
      )}
      {toast && (
        <div className="gp-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
