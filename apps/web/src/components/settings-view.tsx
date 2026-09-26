'use client';

import { settingsAction, type SettingsIntent } from '@/app/actions';
import { t, type Key, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface SettingsData {
  me: string;
  admins: { email: string; fullName: string | null; notify: boolean }[];
  restaurants: { id: string; name: string; active: boolean }[];
}

/**
 * Administration (parity checklist D): the Admins tab and the restaurants, which had no
 * screen in the Apps Script portal because they lived in the spreadsheet. Drawn with
 * the old stylesheet's own parts (.panel, .ph, .rowbtn, .pill, .gp-confirm). Every
 * change asks the server, which checks the caller is an admin and audits it.
 */
export function SettingsView({ lang, data }: { lang: Lang; data: SettingsData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [newAdmin, setNewAdmin] = useState({ email: '', name: '' });
  const [newStore, setNewStore] = useState({ id: '', name: '' });
  // Adding an admin or a restaurant is rare, so each form stays closed behind a button
  // until asked for (owner's call, 2026-09-25): no fields sitting open to invite it.
  const [adding, setAdding] = useState<'admin' | 'store' | null>(null);
  const openButton = (which: 'admin' | 'store', label: string) => (
    <button
      type="button"
      className="btn-ask"
      style={{ width: 'auto', marginTop: 12 }}
      onClick={() => {
        setMessage(null);
        setAdding(which);
      }}
    >
      + {label}
    </button>
  );
  const cancelButton = (reset: () => void) => (
    <button
      type="button"
      className="btn-x"
      onClick={() => {
        reset();
        setAdding(null);
      }}
    >
      {t(lang, 'cancel')}
    </button>
  );

  const run = async (key: string, intent: SettingsIntent, args: Parameters<typeof settingsAction>[1], done?: () => void) => {
    setBusy(key);
    setMessage(null);
    try {
      const { outcome } = await settingsAction(intent, args);
      if (outcome === 'done') {
        done?.();
        router.refresh();
      } else setMessage({ text: t(lang, `out_${outcome}` as Key), ok: false });
    } catch {
      setMessage({ text: t(lang, 'out_error'), ok: false });
    }
    setBusy(null);
    setConfirm(null);
  };

  return (
    <main className="page" lang={lang}>
      <div className="ph">
        <div>
          <h1 className="h1">{t(lang, 'navSettings')}</h1>
          <p>{t(lang, 'settingsSub')}</p>
        </div>
        <Link href="/admin/audit" className="sbtn end">
          {t(lang, 'openLog')}
        </Link>
      </div>
      {message && (
        <p className={message.ok ? 'sent' : 'gp-err'} role="alert">
          {message.text}
        </p>
      )}

      <section className="panel" aria-labelledby="admins">
        <div className="ph">
          <div>
            <h2 id="admins">{t(lang, 'adminsTitle')}</h2>
            <p>{t(lang, 'adminsHelp')}</p>
          </div>
        </div>
        <div className="setlist">
          {data.admins.map((a) => {
            const self = a.email === data.me;
            const key = `admin:${a.email}`;
            return (
              <div className="setrow" key={a.email}>
                <div className="who">
                  <b>
                    {a.fullName ?? a.email}
                    {self && <span className="mini" style={{ marginLeft: 8 }}>{t(lang, 'you')}</span>}
                  </b>
                  <span>{a.email}</span>
                </div>
                <div className="acts">
                  <label>
                    <input
                      type="checkbox"
                      checked={a.notify}
                      disabled={busy === key}
                      onChange={(e) => run(key, 'admin_notify', { email: a.email, on: e.target.checked })}
                    />
                    {t(lang, 'notifyLabel')}
                  </label>
                  {!self && confirm !== key && (
                    <button type="button" className="rowbtn soft" disabled={busy === key} onClick={() => setConfirm(key)}>
                      {t(lang, 'removeAdmin')}
                    </button>
                  )}
                </div>
                {confirm === key && (
                  <div className="gp-confirm">
                    <p>{t(lang, 'confirmRemoveAdmin').replace('{who}', a.fullName ?? a.email)}</p>
                    <div className="askrow">
                      <button type="button" className="gp-btn no" disabled={busy === key} onClick={() => run(key, 'admin_remove', { email: a.email })}>
                        {busy === key ? t(lang, 'gpSaving') : t(lang, 'removeAdmin')}
                      </button>
                      <button type="button" className="gp-btn plain" onClick={() => setConfirm(null)}>
                        {t(lang, 'cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {adding !== 'admin' ? (
          openButton('admin', t(lang, 'addAdmin'))
        ) : (
        <form
          className="askbox"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            run('admin:new', 'admin_add', newAdmin, () => {
              setNewAdmin({ email: '', name: '' });
              setAdding(null);
            });
          }}
        >
          <p>
            <b>{t(lang, 'addAdmin')}</b>
          </p>
          <label>
            {t(lang, 'addAdminEmail')}
            <input type="email" required autoFocus autoComplete="off" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
          </label>
          <label>
            {t(lang, 'addAdminName')}
            <input autoComplete="off" value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} />
          </label>
          <div className="askrow">
            <button type="submit" className="btn-go" disabled={busy === 'admin:new'}>
              {busy === 'admin:new' ? t(lang, 'gpSaving') : t(lang, 'add')}
            </button>
            {cancelButton(() => setNewAdmin({ email: '', name: '' }))}
          </div>
        </form>
        )}
      </section>

      <section className="panel" aria-labelledby="stores">
        <div className="ph">
          <div>
            <h2 id="stores">{t(lang, 'restaurantsTitle')}</h2>
            <p>{t(lang, 'restaurantsHelp')}</p>
          </div>
        </div>
        <div className="setlist">
          {data.restaurants.map((r) => {
            const key = `store:${r.id}`;
            return (
              <div className="setrow" key={r.id}>
                <div className="who">
                  <b>{`${r.id} - ${r.name}`}</b>
                </div>
                <div className="acts">
                  <span className={`pill ${r.active ? 'on' : 'off'}`}>{t(lang, r.active ? 'isOpen' : 'isClosed')}</span>
                  {/* Opening only. Closing is not done from here (owner's call, 2026-09-25):
                      one stray click would stop everyone at that restaurant. */}
                  {!r.active && (
                    <button type="button" className="rowbtn go" disabled={busy === key} onClick={() => run(key, 'restaurant_active', { id: r.id, on: true })}>
                      {busy === key ? t(lang, 'gpSaving') : t(lang, 'open')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {adding !== 'store' ? (
          openButton('store', t(lang, 'addRestaurant'))
        ) : (
        <form
          className="askbox"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            run('store:new', 'restaurant_add', newStore, () => {
              setNewStore({ id: '', name: '' });
              setAdding(null);
            });
          }}
        >
          <p>
            <b>{t(lang, 'addRestaurant')}</b> {t(lang, 'addedClosed')}
          </p>
          <label>
            {t(lang, 'restaurantNumber')}
            <input inputMode="numeric" required autoFocus autoComplete="off" value={newStore.id} onChange={(e) => setNewStore({ ...newStore, id: e.target.value })} />
          </label>
          <label>
            {t(lang, 'restaurantName')}
            <input required autoComplete="off" value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} />
          </label>
          <div className="askrow">
            <button type="submit" className="btn-go" disabled={busy === 'store:new'}>
              {busy === 'store:new' ? t(lang, 'gpSaving') : t(lang, 'add')}
            </button>
            {cancelButton(() => setNewStore({ id: '', name: '' }))}
          </div>
        </form>
        )}
      </section>
    </main>
  );
}
