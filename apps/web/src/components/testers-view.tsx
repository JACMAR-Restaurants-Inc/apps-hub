'use client';

import { testerAction } from '@/app/actions';
import { betaApp } from '@/lib/beta/apps';
import type { LivePerson } from '@/lib/beta/testers';
import { fold } from '@/lib/home';
import { t, type Key, type Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { BetaCard } from './beta-card';
import { SessionExpired } from './session-expired';

type Tester = LivePerson & { addedAt: string; addedBy: string };

export interface BetaAdminData {
  key: string;
  testers: Tester[];
  candidates: LivePerson[];
}

const ROLE_KEY: Record<string, Key> = { office: 'role_office', manager: 'role_manager', viewer: 'role_viewer' };

/**
 * The admin's half of Tests: each beta, its testers, Ajouter un testeur and Retirer.
 * Built from Administration's parts (.panel, .setrow, .askbox, .gp-confirm). A tester's
 * role and restaurants are shown as they are in the LIVE app, since that is what they
 * test with; the server checks the caller is an admin and audits every change.
 */
export function TestersView({ lang, betas, storeNames }: { lang: Lang; betas: BetaAdminData[]; storeNames: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const access = (p: LivePerson) => {
    const role = p.role ? (ROLE_KEY[p.role] ? t(lang, ROLE_KEY[p.role]!) : p.role) : '';
    const where = p.stores.map((s) => `${s} - ${storeNames[s] ?? s}`).join(', ');
    return [role, where].filter(Boolean).join(' · ');
  };

  const run = async (key: string, intent: 'add' | 'remove', app: string, email: string, done?: () => void) => {
    setBusy(key);
    setMessage(null);
    try {
      const { outcome } = await testerAction(intent, app, email);
      if (outcome === 'done') {
        done?.();
        router.refresh();
      } else if (outcome === 'expired') setExpired(true);
      else setMessage(t(lang, `out_${outcome}` as Key));
    } catch {
      setMessage(t(lang, 'out_error'));
    }
    setBusy(null);
    setConfirm(null);
  };

  return (
    <>
      {message && (
        <p className="gp-err" role="alert">
          {message}
        </p>
      )}
      {expired && <SessionExpired lang={lang} />}
      {betas.map((b) => {
        const app = betaApp(b.key);
        if (!app) return null;
        const appName = lang === 'fr' ? app.nameFr : app.name;
        return (
          <section className="panel betapanel" key={b.key} aria-labelledby={`testers-${b.key}`}>
            <div className="appgrid">
              <BetaCard lang={lang} app={app} />
            </div>
            <div className="ph" style={{ marginTop: 16 }}>
              <h2 id={`testers-${b.key}`}>
                {t(lang, 'testersTitle')} <span className="cnt">{b.testers.length}</span>
              </h2>
            </div>
            {b.testers.length === 0 ? (
              <p className="favempty">{t(lang, 'testersNone')}</p>
            ) : (
              <div className="setlist">
                {b.testers.map((x) => {
                  const key = `${b.key}:${x.email}`;
                  const lost = x.status !== 'active' || !x.personActive;
                  const who = x.fullName ?? x.email;
                  return (
                    <div className="setrow" key={x.email}>
                      <div className="who">
                        <b>{who}</b>
                        <span>{x.email}</span>
                      </div>
                      <div className="acts">
                        {lost ? (
                          <span className="pill off">{t(lang, 'testerLost')}</span>
                        ) : (
                          <span className="testeraccess">{access(x)}</span>
                        )}
                        <span className="testersince">{t(lang, 'testerSince').replace('{date}', x.addedAt)}</span>
                        {confirm !== key && (
                          <button type="button" className="rowbtn danger" disabled={busy === key} onClick={() => setConfirm(key)}>
                            {t(lang, 'removeTester')}
                          </button>
                        )}
                      </div>
                      {confirm === key && (
                        <div className="gp-confirm">
                          <p>{t(lang, 'confirmRemoveTester').replace('{who}', who)}</p>
                          <div className="askrow">
                            <button type="button" className="gp-btn no" disabled={busy === key} onClick={() => run(key, 'remove', b.key, x.email)}>
                              {busy === key ? t(lang, 'gpSaving') : t(lang, 'removeTester')}
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
            )}

            {adding !== b.key ? (
              <button
                type="button"
                className="btn-ask"
                style={{ width: 'auto', marginTop: 12 }}
                onClick={() => {
                  setMessage(null);
                  setPick('');
                  setQuery('');
                  setAdding(b.key);
                }}
              >
                + {t(lang, 'addTester')}
              </button>
            ) : b.candidates.length === 0 ? (
              <div className="askbox" style={{ marginTop: 12 }}>
                <p>{t(lang, 'addTesterNobody').replace('{app}', appName)}</p>
                <div className="askrow">
                  <button type="button" className="btn-x" onClick={() => setAdding(null)}>
                    {t(lang, 'cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="askbox"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pick) run(`${b.key}:new`, 'add', b.key, pick, () => setAdding(null));
                }}
              >
                <p>
                  <b>{t(lang, 'addTester')}</b>
                </p>
                <PersonSearch
                  lang={lang}
                  people={b.candidates}
                  describe={access}
                  query={query}
                  onQuery={setQuery}
                  pick={pick}
                  onPick={setPick}
                  help={t(lang, 'addTesterHelp').replace('{app}', appName)}
                />
                <div className="askrow">
                  <button type="submit" className="btn-go" disabled={!pick || busy === `${b.key}:new`}>
                    {busy === `${b.key}:new` ? t(lang, 'gpSaving') : t(lang, 'add')}
                  </button>
                  <button type="button" className="btn-x" onClick={() => setAdding(null)}>
                    {t(lang, 'cancel')}
                  </button>
                </div>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}

const SHOWN = 8;

/**
 * Finding a tester among many (owner, 2026-09-30: "lets say we have 100 users"): type
 * any part of a name, address, role or restaurant, accents and case ignored, and pick
 * from the first few matches. Nothing is listed before a letter is typed.
 */
function PersonSearch(props: {
  lang: Lang;
  people: LivePerson[];
  describe: (p: LivePerson) => string;
  query: string;
  onQuery: (q: string) => void;
  pick: string;
  onPick: (email: string) => void;
  help: string;
}) {
  const { lang, people, describe, query, pick } = props;
  const id = useId();
  const needle = fold(query.trim());
  const chosen = people.find((p) => p.email === pick);
  const matches = needle ? people.filter((p) => fold(`${p.fullName ?? ''} ${p.email} ${describe(p)}`).includes(needle)) : [];

  return (
    <div className="pickperson">
      <label htmlFor={`${id}-q`}>{t(lang, 'addTesterSearch')}</label>
      <input
        id={`${id}-q`}
        type="search"
        autoFocus
        autoComplete="off"
        placeholder={t(lang, 'addTesterSearchHint')}
        value={query}
        onChange={(e) => props.onQuery(e.target.value)}
        aria-describedby={`${id}-help`}
      />
      <span className="hint" id={`${id}-help`}>
        {props.help}
      </span>
      {chosen && (
        <div className="pickchosen" role="status">
          <span className="mini">{t(lang, 'addTesterChosen')}</span>
          <b>{chosen.fullName ?? chosen.email}</b>
          <span>{describe(chosen)}</span>
        </div>
      )}
      {needle && (
        <ul className="picklist" aria-label={t(lang, 'addTesterSearch')}>
          {matches.slice(0, SHOWN).map((p) => (
            <li key={p.email}>
              <button type="button" aria-pressed={p.email === pick} onClick={() => props.onPick(p.email)}>
                <b>{p.fullName ?? p.email}</b>
                <span>{p.email}</span>
                <span>{describe(p)}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="picknone">{t(lang, 'addTesterNoMatch')}</li>}
          {matches.length > SHOWN && <li className="picknone">{t(lang, 'addTesterMore').replace('{n}', String(matches.length - SHOWN))}</li>}
        </ul>
      )}
    </div>
  );
}
