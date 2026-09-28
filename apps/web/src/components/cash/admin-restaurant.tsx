'use client';

import { adminCashAction } from '@/app/cash/actions';
import { ct, type CashKey } from '@/lib/cash/i18n';
import type { AdminRestaurant } from '@/lib/cash/settings';
import type { Lang } from '@/lib/i18n';
import { formatCents } from '@hub/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const NOTE: Record<string, CashKey> = {
  done: 'adm_done',
  unchanged: 'adm_unchanged',
  changed: 'adm_changed',
  invalid: 'adm_invalid',
  exists: 'adm_exists',
  not_found: 'adm_email_needs_total',
  denied: 'err_denied',
  expired: 'session_expired_title',
};

/** Typed amount shown back as the field had it: 4600 -> "4600,00" in French. */
const plain = (c: number, lang: Lang) => (c / 100).toFixed(2).replace('.', lang === 'fr' ? ',' : '.');

/**
 * One restaurant on the Admin page: expected total (two steps: it re-bases every
 * variance after it), report address, and tills. Each change is sent with the value
 * the page showed, and the page is reloaded after every answer.
 */
export function AdminRestaurantCard({ lang, id, name, data, nextTill }: { lang: Lang; id: string; name: string; data: AdminRestaurant; nextTill: number }) {
  const L = (k: CashKey) => ct(lang, k);
  const money = (c: number) => formatCents(c, lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ key: CashKey; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<'expected' | 'email' | null>(null);
  const [expected, setExpected] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [add, setAdd] = useState({ number: String(nextTill), label: '', base: '' });

  async function send(input: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    const { outcome } = await adminCashAction({ rid: id, ...input }).catch(() => ({ outcome: 'error' as const }));
    setBusy(false);
    setNote({ key: NOTE[outcome] ?? 'error_generic', ok: outcome === 'done' || outcome === 'unchanged' });
    if (outcome === 'done' || outcome === 'changed') {
      setEditing(null);
      setConfirming(null);
      router.refresh();
    }
    return outcome;
  }

  return (
    <section className="card cb-admin">
      <h2>
        {name} <small>{id}</small>
      </h2>

      <div className="cb-admrow">
        <span className="lbl">{L('adm_expected')}</span>
        {editing === 'expected' ? (
          confirming !== null ? (
            <div className="cb-admconfirm" role="alert">
              <p>
                {L('adm_expected_confirm')
                  .replace('{from}', data.expectedTotalCents === null ? '–' : money(data.expectedTotalCents))
                  .replaceAll('{to}', money(confirming))}
              </p>
              <button type="button" className="cb-danger" disabled={busy} onClick={() => send({ intent: 'expected', shown: data.expectedTotalCents === null ? null : plain(data.expectedTotalCents, 'en'), next: plain(confirming, 'en') })}>
                {L('adm_confirm')}
              </button>
              <button type="button" className="cb-ghost" onClick={() => setConfirming(null)}>
                {L('adm_cancel')}
              </button>
            </div>
          ) : (
            <form
              className="cb-adminline"
              onSubmit={(e) => {
                e.preventDefault();
                const c = parseTyped(expected);
                if (c === null || c <= 0) return setNote({ key: 'adm_invalid', ok: false });
                setConfirming(c);
              }}
            >
              <input type="text" inputMode="decimal" autoFocus value={expected} onChange={(e) => setExpected(e.target.value)} aria-label={L('adm_expected')} />
              <button type="submit" className="btn">
                {L('adm_continue')}
              </button>
              <button type="button" className="cb-ghost" onClick={() => setEditing(null)}>
                {L('adm_cancel')}
              </button>
            </form>
          )
        ) : (
          <span className="val">
            <b>{data.expectedTotalCents === null ? L('adm_expected_none') : money(data.expectedTotalCents)}</b>
            <button
              type="button"
              className="textlink"
              onClick={() => {
                setExpected(data.expectedTotalCents === null ? '' : plain(data.expectedTotalCents, lang));
                setEditing('expected');
              }}
            >
              {L('adm_edit')}
            </button>
          </span>
        )}
      </div>

      <div className="cb-admrow">
        <span className="lbl">{L('adm_report_email')}</span>
        {editing === 'email' ? (
          <form
            className="cb-adminline"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ intent: 'email', shown: data.reportEmail, next: email });
            }}
          >
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-label={L('adm_report_email')} />
            <button type="submit" className="btn" disabled={busy}>
              {L('adm_save')}
            </button>
            <button type="button" className="cb-ghost" onClick={() => setEditing(null)}>
              {L('adm_cancel')}
            </button>
          </form>
        ) : (
          <span className="val">
            <b>{data.reportEmail ?? L('adm_report_email_none')}</b>
            <button
              type="button"
              className="textlink"
              onClick={() => {
                setEmail(data.reportEmail ?? '');
                setEditing('email');
              }}
            >
              {L('adm_edit')}
            </button>
          </span>
        )}
      </div>

      <h3 className="cb-sec">{L('adm_tills')}</h3>
      <div className="cb-admtills">
        <div className="cb-admtill head" aria-hidden="true">
          <span>{L('adm_till_no')}</span>
          <span>{L('adm_till_label')}</span>
          <span>{L('adm_till_base')}</span>
          <span />
        </div>
        {data.tills.map((t) => (
          <TillRow key={t.tillNumber} lang={lang} till={t} busy={busy} send={send} />
        ))}
        <form
          className="cb-admtill add"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await send({ intent: 'till_add', number: add.number, label: add.label, base: add.base })) === 'done') setAdd({ number: String(Number(add.number) + 1), label: '', base: '' });
          }}
        >
          <input type="text" inputMode="numeric" value={add.number} onChange={(e) => setAdd({ ...add, number: e.target.value })} aria-label={L('adm_till_no')} />
          <input type="text" maxLength={40} placeholder={`${L('till')} ${add.number}`} value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} aria-label={L('adm_till_label')} />
          <input type="text" inputMode="decimal" placeholder="0,00" value={add.base} onChange={(e) => setAdd({ ...add, base: e.target.value })} aria-label={L('adm_till_base')} />
          <button type="submit" className="cb-ghost" disabled={busy}>
            + {L('adm_add_till')}
          </button>
        </form>
      </div>

      {note && (
        <p className={note.ok ? 'cb-flash' : 'cb-error'} role="status">
          {L(note.key)}
        </p>
      )}
    </section>
  );
}

function TillRow({
  lang,
  till,
  busy,
  send,
}: {
  lang: Lang;
  till: AdminRestaurant['tills'][number];
  busy: boolean;
  send: (input: Record<string, unknown>) => Promise<string>;
}) {
  const L = (k: CashKey) => ct(lang, k);
  const [label, setLabel] = useState(till.tillLabel);
  const [base, setBase] = useState(plain(till.baseAmountCents, lang));
  const [retiring, setRetiring] = useState(false);
  const dirty = label !== till.tillLabel || parseTyped(base) !== till.baseAmountCents;
  const shown = { label: till.tillLabel, base: till.baseAmountCents };
  return (
    <form
      className={`cb-admtill${till.active ? '' : ' retired'}`}
      onSubmit={(e) => {
        e.preventDefault();
        void send({ intent: 'till_update', number: till.tillNumber, shown, label, base });
      }}
    >
      <b>{till.tillNumber}</b>
      <input type="text" maxLength={40} value={label} disabled={!till.active} onChange={(e) => setLabel(e.target.value)} aria-label={L('adm_till_label')} />
      <input type="text" inputMode="decimal" value={base} disabled={!till.active} onChange={(e) => setBase(e.target.value)} aria-label={L('adm_till_base')} />
      <span className="acts">
        {dirty && till.active && (
          <button type="submit" className="btn" disabled={busy}>
            {L('adm_save')}
          </button>
        )}
        {!till.active ? (
          <>
            <span className="cb-badge off">{L('adm_retired')}</span>
            <button type="button" className="cb-ghost" disabled={busy} onClick={() => send({ intent: 'till_active', number: till.tillNumber, active: true })}>
              {L('adm_restore')}
            </button>
          </>
        ) : retiring ? (
          <>
            <small>{L('adm_retire_confirm')}</small>
            <button type="button" className="cb-danger" disabled={busy} onClick={() => send({ intent: 'till_active', number: till.tillNumber, active: false })}>
              {L('adm_retire')}
            </button>
            <button type="button" className="cb-ghost" onClick={() => setRetiring(false)}>
              {L('adm_cancel')}
            </button>
          </>
        ) : (
          !dirty && (
            <button type="button" className="cb-attbtn danger" onClick={() => setRetiring(true)}>
              {L('adm_retire')}
            </button>
          )
        )}
      </span>
    </form>
  );
}

/** "4 600,00", "4600", "4,600.00" -> cents; null if not an amount. */
function parseTyped(s: string): number | null {
  const t = s.replace(/[\s  $]/g, '');
  if (!t) return null;
  // A comma followed by exactly two digits at the end is a decimal comma; otherwise commas group thousands.
  const norm = /,\d{2}$/.test(t) && !t.includes('.') ? t.replace(/,/g, '.') : t.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}
