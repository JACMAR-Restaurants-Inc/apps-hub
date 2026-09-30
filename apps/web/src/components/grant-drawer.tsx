'use client';

import { adminAccessAction } from '@/app/actions';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { Role } from '@hub/rbac';
import { useEffect, useRef, useState } from 'react';
import type { DirData } from './directory';
import { SessionExpired } from './session-expired';

export interface DrawerTarget {
  email: string;
  app: string;
  mode: 'grant' | 'manage';
}

const ROLE_ORDER: Role[] = ['manager', 'viewer', 'office'];
type Busy = '' | 'grant' | 'update' | 'decline' | 'revoke';

/**
 * The Grant panel (RBAC §48), as the Apps Script portal drew it: a drawer from the right,
 * at most 480px, full screen on a phone.
 * - Opens with the Clearview restaurant ticked on a request, or what they hold now.
 * - Only the roles the app's permissions name, each with its help; only open restaurants.
 * - A Gérant gets ONE restaurant (owner, 2026-09-30): radio buttons instead of boxes, so
 *   a second cannot be ticked by mistake. Choosing Gérant keeps one of those ticked (the
 *   Clearview one if it is there) only when it is the only one; otherwise the admin picks.
 * - The note says why the main button is disabled, or what pressing it will do.
 * - While saving: the pressed button spins, a line says what is happening and after 6 s
 *   that it is still going, and the panel cannot be closed, so a failure has somewhere
 *   to show. The server re-checks everything (requireSystemAdmin, the row still as seen).
 */
export function GrantDrawer(props: {
  lang: Lang;
  data: DirData;
  target: DrawerTarget;
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const { lang, data, target } = props;
  const person = data.people.find((p) => p.email === target.email);
  const app = person?.apps.find((a) => a.key === target.app);
  const info = data.appInfo.find((a) => a.key === target.app);
  const openIds = new Set(data.restaurants.filter((r) => r.active).map((r) => r.id));

  const [role, setRole] = useState<Role | ''>(target.mode === 'grant' ? '' : (app?.role ?? ''));
  const [stores, setStores] = useState<string[]>(() =>
    target.mode === 'grant'
      ? person?.clearviewStore && openIds.has(person.clearviewStore)
        ? [person.clearviewStore]
        : []
      : (app?.stores ?? []).filter((id) => openIds.has(id)),
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const firstRole = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('gp-open');
    firstRole.current?.focus();
    return () => document.body.classList.remove('gp-open');
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && props.onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, props]);

  if (!person || !app || !info) return null;
  const who = person.fullName ?? person.email;
  const appName = lang === 'fr' ? info.nameFr : info.name;
  const storeLabel = (id: string) => {
    const n = data.restaurants.find((r) => r.id === id)?.name;
    return n ? `${id} - ${n}` : id;
  };

  // grantCheck, from the old panel.
  let check: { ok: boolean; key: Key };
  // A Gérant runs one restaurant. Only an existing manager saved with several (before
  // the rule) can arrive here with more; they must be brought down to one to save.
  const single = role === 'manager';
  if (!role) check = { ok: false, key: 'needRole' };
  else if (single && stores.length > 1) check = { ok: false, key: 'needOneStoreMgr' };
  else if (!stores.length) check = { ok: false, key: role === 'manager' ? 'needStoreMgr' : 'needStore' };
  else if (target.mode === 'manage') {
    const was = app.stores.filter((id) => openIds.has(id)).sort().join();
    const same = role === app.role && [...stores].sort().join() === was;
    check = { ok: !same, key: same ? 'sameAsBefore' : 'readyChange' };
  } else check = { ok: true, key: 'readyGrant' };

  const submit = async (kind: Exclude<Busy, ''>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6000);
    const form = new FormData();
    form.set('intent', kind);
    form.set('app', target.app);
    form.set('email', target.email);
    if (role) form.set('role', role);
    for (const s of stores) form.append('stores', s);
    try {
      const { outcome } = await adminAccessAction({ outcome: null }, form);
      clearTimeout(timer);
      if (outcome === 'done' || outcome === 'done_unsent') {
        props.onDone(
          kind === 'grant'
            ? outcome === 'done'
              ? t(lang, 'toastGrant').replace('{who}', who)
              : t(lang, 'toastGrantNoMail')
            : kind === 'update'
              ? t(lang, 'toastSave')
              : kind === 'decline'
                ? t(lang, 'toastDecline')
                : t(lang, 'toastRemove'),
        );
        return;
      }
      if (outcome === 'changed' || outcome === 'error') {
        // The directory is redrawn from the database; the panel closes on what it said.
        props.onDone(t(lang, outcome === 'changed' ? 'errChanged' : 'errFailed'));
        return;
      }
      setBusy('');
      setConfirm(false);
      setError(outcome === 'expired' ? 'errSession' : outcome === 'denied' ? 'errAdmin' : 'invalid');
    } catch {
      clearTimeout(timer);
      props.onDone(t(lang, 'errFailed'));
    }
  };

  const spin = (
    <>
      <span className="gp-spin" aria-hidden="true" />
      {t(lang, 'gpSaving')}
    </>
  );
  const main = target.mode === 'grant' ? 'grant' : 'update';
  const roles = [...info.roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const since = app.since
    ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long' }).format(new Date(app.since))
    : '';

  return (
    <>
      <div className="gp-scrim" onClick={() => !busy && props.onClose()} />
      <aside className={`gp${busy ? ' is-busy' : ''}`} role="dialog" aria-modal="true" aria-labelledby="gpTitle" aria-busy={busy ? true : undefined}>
        <div className="gp-head">
          <div>
            <h2 id="gpTitle">{person.fullName ?? t(lang, 'noName')}</h2>
            <p>
              {target.mode === 'grant'
                ? t(lang, 'gpAskedFor').replace('{app}', appName) + (since ? ` · ${since}` : '')
                : t(lang, 'gpHas').replace('{app}', appName)}
            </p>
          </div>
          <button type="button" className="gp-x" onClick={props.onClose} aria-label={t(lang, 'gpClose')} disabled={Boolean(busy)}>
            ×
          </button>
        </div>

        <div className="gp-body">
          <dl className="gp-who">
            <dt>{t(lang, 'signsInWith')}</dt>
            <dd>{person.email}</dd>
            <dt>{t(lang, 'hrFile')}</dt>
            <dd>{person.hrEmail ?? <span className="none">{t(lang, 'gpNone')}</span>}</dd>
            <dt>{t(lang, 'employeeNumber')}</dt>
            <dd>{person.employeeNumber ?? <span className="none">{t(lang, 'gpNone')}</span>}</dd>
            <dt>{t(lang, 'gpClearview')}</dt>
            <dd>{person.clearviewStore ? <span className="cv">{storeLabel(person.clearviewStore)}</span> : <span className="none">{t(lang, 'gpNone')}</span>}</dd>
          </dl>

          <fieldset className="gp-fld">
            <legend>
              {t(lang, 'role')} <span>{t(lang, 'gpRoleHelp').replace('{app}', appName)}</span>
            </legend>
            <div className="gp-roles">
              {roles.map((r, i) => {
                const help = info.help[r];
                return (
                  <label className="gp-role" key={r}>
                    <input
                      ref={i === 0 ? firstRole : undefined}
                      type="radio"
                      name="gprole"
                      value={r}
                      checked={role === r}
                      disabled={Boolean(busy)}
                      onChange={() => {
                        setRole(r);
                        // To Gérant with several ticked: keep none, so the admin chooses.
                        if (r === 'manager') setStores((s) => (s.length > 1 ? [] : s));
                      }}
                    />
                    <span>
                      <b>{t(lang, `role_${r}`)}</b>
                      {help && <small>{help[lang]}</small>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="gp-fld">
            <legend>
              {t(lang, 'restaurants')} <span>{t(lang, single ? 'gpStoreHelpMgr' : 'gpStoresHelp')}</span>
            </legend>
            <div className="gp-stores">
              {data.restaurants
                .filter((r) => r.active)
                .map((r) => (
                  <label className="gp-store" key={r.id}>
                    {single ? (
                      <input
                        type="radio"
                        name="gpstore"
                        value={r.id}
                        checked={stores.length === 1 && stores[0] === r.id}
                        disabled={Boolean(busy)}
                        onChange={() => setStores([r.id])}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        value={r.id}
                        checked={stores.includes(r.id)}
                        disabled={Boolean(busy)}
                        onChange={(e) => setStores((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                      />
                    )}
                    <span>
                      {storeLabel(r.id)}
                      {person.clearviewStore === r.id && <em>{t(lang, 'fromClearview')}</em>}
                    </span>
                  </label>
                ))}
            </div>
            {!single && (
              <div className="gp-quick">
                <button type="button" className="textlink" disabled={Boolean(busy)} onClick={() => setStores([...openIds])}>
                  {t(lang, 'gpAll')}
                </button>
                <button type="button" className="textlink" disabled={Boolean(busy)} onClick={() => setStores([])}>
                  {t(lang, 'gpClear')}
                </button>
              </div>
            )}
          </fieldset>

          <p className={`gp-note${check.key.startsWith('need') ? ' warn' : ''}`}>
            {t(lang, check.key)
              .split('{who}')
              .flatMap((part, i) => (i === 0 ? [part] : [<b key={i}>{who}</b>, part]))
              .map((x) => (typeof x === 'string' ? x.replace('{app}', appName) : x))}
          </p>

          {confirm && (
            <div className="gp-confirm">
              <p>
                {t(lang, target.mode === 'grant' ? 'confirmDeclineWho' : 'confirmRemoveWho')
                  .replace('{who}', who)
                  .replace('{app}', appName)}
              </p>
              <div className="askrow">
                <button
                  type="button"
                  className={`gp-btn no${busy ? ' is-busy' : ''}`}
                  disabled={Boolean(busy)}
                  onClick={() => submit(target.mode === 'grant' ? 'decline' : 'revoke')}
                >
                  {busy ? spin : t(lang, target.mode === 'grant' ? 'yesDecline' : 'removeAccess')}
                </button>
                <button type="button" className="gp-btn plain" disabled={Boolean(busy)} onClick={() => setConfirm(false)}>
                  {t(lang, 'cancel')}
                </button>
              </div>
            </div>
          )}
          {error === 'errSession' ? (
            <SessionExpired lang={lang} />
          ) : (
            error && (
              <p className="gp-err" role="alert">
                {t(lang, error)}
              </p>
            )
          )}
        </div>

        <div className="gp-foot">
          {busy && (
            <p className="gp-working" role="status">
              {t(lang, slow ? 'gpWaitLong' : busy === 'grant' ? 'gpWaitGrant' : 'gpWait')}
            </p>
          )}
          <button
            type="button"
            className={`gp-btn go${busy === main ? ' is-busy' : ''}`}
            disabled={!check.ok || Boolean(busy) || confirm}
            onClick={() => submit(main)}
          >
            {busy === main ? spin : t(lang, main === 'grant' ? 'grant' : 'save')}
          </button>
          <button type="button" className="gp-btn no" disabled={Boolean(busy) || confirm} onClick={() => setConfirm(true)}>
            {t(lang, target.mode === 'grant' ? 'decline' : 'removeAccess')}
          </button>
          <span className="sp" />
          <button type="button" className="gp-btn plain" disabled={Boolean(busy)} onClick={props.onClose}>
            {t(lang, 'cancel')}
          </button>
        </div>
      </aside>
    </>
  );
}
