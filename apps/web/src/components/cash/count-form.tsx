'use client';

import { submitCountAction } from '@/app/cash/actions';
import { fixGuidance } from '@/lib/cash/guidance';
import { ct, type CashKey } from '@/lib/cash/i18n';
import { BILLS, COINS, type CountInput, type TillConfig } from '@/lib/cash/math';
import type { PreviousCount } from '@/lib/cash/store';
import type { Lang } from '@/lib/i18n';
import { formatCents, parseCents } from '@hub/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The New Count screen (App.html renderCountBody and friends), section for section:
 * the header, the tills (a total, or counted in detail), coins, bills, petty cash, the
 * fix guidance, send to accounting, then submit, with the running total pinned to the
 * bottom of the screen.
 *
 * What changed from the old screen:
 * - The browser sends only what was counted; the server computes every total (math.ts).
 * - The draft is kept on this phone (localStorage, per restaurant and day), so a
 *   dropped connection or an expired session does not lose a count half entered.
 * - The previous count opens by default: the pilot plan expected nobody to open it
 *   when it was closed (PILOT §5.6).
 * - Cancel asks on the page, not in a browser dialog.
 */

type Pieces = { rolls: string; loose: string };
interface TillDraft {
  mode: 'total' | 'detail';
  counted: string;
  bills: Record<number, string>;
  coins: Record<number, Pieces>;
  fixed: boolean;
}
interface Draft {
  comments: string;
  tills: Record<number, TillDraft>;
  coins: Record<number, Pieces>;
  paper: Record<number, string>;
  pettyMode: 'detail' | 'total';
  receipts: { description: string; amount: string }[];
  pettyTotal: string;
  sendToAccountant: boolean;
}

const BAD = Number.NaN;
/** Cents from what was typed: empty is 0, anything not a positive amount is NaN. */
function amount(text: string): number {
  const s = text.trim();
  if (!s) return 0;
  const c = parseCents(s);
  return c === null || c < 0 ? BAD : c;
}
/** A count of pieces: empty is 0, anything not a whole number is NaN. */
function whole(text: string): number {
  const s = text.trim();
  if (!s) return 0;
  return /^\d{1,6}$/.test(s) ? Number(s) : BAD;
}
const ok = (n: number) => Number.isFinite(n);

function emptyDraft(tills: readonly TillConfig[]): Draft {
  return {
    comments: '',
    tills: Object.fromEntries(tills.map((t) => [t.tillNumber, { mode: 'total', counted: '', bills: {}, coins: {}, fixed: false }])),
    coins: {},
    paper: {},
    pettyMode: 'detail',
    receipts: [{ description: '', amount: '' }],
    pettyTotal: '',
    sendToAccountant: false,
  };
}

const coinsOf = (c: Record<number, Pieces>) =>
  COINS.reduce((s, d) => s + whole(c[d.cents]?.rolls ?? '') * d.rollCents + whole(c[d.cents]?.loose ?? '') * d.cents, 0);
const billsOf = (b: Record<number, string>) => BILLS.reduce((s, d) => s + whole(b[d] ?? '') * d, 0);

/** A till's counted amount in cents, NaN if something typed is not a number, null if untouched. */
function tillCounted(t: TillDraft): number | null {
  if (t.mode === 'total') return t.counted.trim() ? amount(t.counted) : null;
  const touched = Object.values(t.bills).some((v) => v.trim()) || Object.values(t.coins).some((p) => p.rolls.trim() || p.loose.trim());
  return touched ? coinsOf(t.coins) + billsOf(t.bills) : null;
}

export function CountForm(props: {
  lang: Lang;
  store: { id: string; name: string };
  canChangeStore: boolean;
  managerName: string;
  today: string;
  setup: { tills: TillConfig[]; expectedTotalCents: number };
  previous: { today: PreviousCount[]; priorDay: PreviousCount | null };
  canSendToAccountant: boolean;
}) {
  const { lang, store, setup } = props;
  const L = (k: CashKey) => ct(lang, k);
  const money = (c: number) => (ok(c) ? formatCents(c, lang) : '–');
  const signed = (c: number) => (c > 0 ? '+' : '') + money(c);
  const router = useRouter();

  const key = `cash.draft.${store.id}.${props.today}`;
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(setup.tills));
  const [restored, setRestored] = useState(false);
  const [showPrevious, setShowPrevious] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CashKey | null>(null);
  const [tried, setTried] = useState(false);
  const loaded = useRef(false);

  // Restore a draft kept on this phone, once, after the first paint (the server
  // cannot see localStorage, so doing it during render would mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && saved !== JSON.stringify(emptyDraft(setup.tills))) {
        const d = JSON.parse(saved) as Draft;
        const fresh = emptyDraft(setup.tills);
        // Only the tills configured today: a till removed since is dropped, a new one starts empty.
        const tills = Object.fromEntries(setup.tills.map((t) => [t.tillNumber, d.tills?.[t.tillNumber] ?? fresh.tills[t.tillNumber]!]));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- once, from storage the server cannot read
        setDraft({ ...fresh, ...d, tills });
        setRestored(true);
      }
    } catch {}
    loaded.current = true;
  }, [key, setup.tills]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      const json = JSON.stringify(draft);
      // Nothing entered is nothing to keep: an empty draft must not come back as "restored".
      if (json === JSON.stringify(emptyDraft(setup.tills))) localStorage.removeItem(key);
      else localStorage.setItem(key, json);
    } catch {}
  }, [key, draft, setup.tills]);

  const edit = (fn: (d: Draft) => Draft) => {
    setError(null);
    setDraft((d) => fn(d));
  };
  const editTill = (n: number, fn: (t: TillDraft) => TillDraft) => edit((d) => ({ ...d, tills: { ...d.tills, [n]: fn(d.tills[n]!) } }));

  const totals = useMemo(() => {
    const tills = setup.tills.map((t) => tillCounted(draft.tills[t.tillNumber]!) ?? 0);
    const tillsT = tills.reduce((s, v) => s + v, 0);
    const coinsT = coinsOf(draft.coins);
    const paperT = billsOf(draft.paper);
    const pettyT = draft.pettyMode === 'detail' ? draft.receipts.reduce((s, r) => s + amount(r.amount), 0) : amount(draft.pettyTotal);
    const grand = tillsT + coinsT + paperT + pettyT;
    return { tillsT, coinsT, paperT, pettyT, grand, variance: grand - setup.expectedTotalCents };
  }, [draft, setup]);

  const guidance = useMemo(
    () =>
      ok(totals.variance)
        ? fixGuidance(
            setup.tills.map((t) => {
              const c = tillCounted(draft.tills[t.tillNumber]!);
              return { label: t.tillLabel, baseCents: t.baseAmountCents, countedCents: c !== null && ok(c) ? c : null, fixed: draft.tills[t.tillNumber]!.fixed };
            }),
            totals.variance,
          )
        : null,
    [draft, setup, totals.variance],
  );

  function build(): CountInput | null {
    const tills = setup.tills.map((t) => {
      const d = draft.tills[t.tillNumber]!;
      return { tillNumber: t.tillNumber, countedCents: tillCounted(d) ?? 0, fixed: d.fixed };
    });
    const coins = COINS.map((c) => ({ cents: c.cents, rolls: whole(draft.coins[c.cents]?.rolls ?? ''), loose: whole(draft.coins[c.cents]?.loose ?? '') }));
    const paper = BILLS.map((cents) => ({ cents, count: whole(draft.paper[cents] ?? '') }));
    const pettyCash =
      draft.pettyMode === 'detail'
        ? draft.receipts.filter((r) => r.amount.trim() || r.description.trim()).map((r) => ({ description: r.description, amountCents: amount(r.amount) }))
        : draft.pettyTotal.trim()
          ? [{ description: 'Total', amountCents: amount(draft.pettyTotal) }]
          : [];
    const numbers = [...tills.map((t) => t.countedCents), ...coins.flatMap((c) => [c.rolls, c.loose]), ...paper.map((p) => p.count), ...pettyCash.map((p) => p.amountCents)];
    if (!numbers.every(ok)) return null;
    return {
      restaurantId: store.id,
      comments: draft.comments,
      tills,
      coins,
      paper,
      pettyCash,
      sendToAccountant: props.canSendToAccountant && draft.sendToAccountant,
      attachmentIds: [],
    };
  }

  async function submit() {
    setTried(true);
    setError(null);
    const input = build();
    if (!input) {
      setError('err_bad_number');
      // The bad field may be a screen or two up: take them to it.
      requestAnimationFrame(() => {
        const bad = document.querySelector<HTMLInputElement>('.cb-form [aria-invalid="true"]');
        bad?.scrollIntoView({ block: 'center' });
        bad?.focus({ preventScroll: true });
      });
      return;
    }
    setBusy(true);
    const res = await submitCountAction(input).catch(() => ({ outcome: 'error' as const }));
    if (res.outcome === 'done') {
      try {
        localStorage.removeItem(key);
      } catch {}
      router.push(`/cash?submitted=${'id' in res ? res.id : ''}`);
      return;
    }
    setBusy(false);
    const messages: Partial<Record<string, CashKey>> = {
      duplicate: 'err_duplicate',
      not_configured: 'err_not_configured',
      tills_mismatch: 'err_tills',
      bad_number: 'err_bad_number',
      bad_denomination: 'err_bad_number',
      too_long: 'err_too_long',
      too_many_lines: 'err_too_long',
      attachment_invalid: 'err_attachment',
      denied: 'err_denied',
      expired: 'session_expired_body',
    };
    setError(messages[res.outcome] ?? 'error_generic');
  }

  const bad = (text: string, parse: (s: string) => number) => tried && !ok(parse(text));
  const prev = props.previous.today.length ? props.previous.today : props.previous.priorDay ? [props.previous.priorDay] : [];

  return (
    <div className="cb-form">
      <div className="pagehead">
        <h1>{L('count_new')}</h1>
        <p className="cb-store">
          <b>{store.name}</b> <span>{store.id}</span>
          {props.canChangeStore && (
            <Link href="/cash/new" className="textlink">
              {L('change_restaurant')}
            </Link>
          )}
        </p>
      </div>

      {restored && <p className="cb-flash">{L('draft_restored')}</p>}

      {prev.length > 0 && (
        <section>
          <button type="button" className="cb-ghost" onClick={() => setShowPrevious((s) => !s)} aria-expanded={showPrevious}>
            {L(showPrevious ? 'prev_count_hide' : 'prev_count_show')}
          </button>
          {showPrevious && <PreviousPanels lang={lang} counts={prev} priorDay={!props.previous.today.length} />}
        </section>
      )}

      <section className="card cb-head">
        <div className="cb-cols2">
          <label className="cb-field">
            <span>{L('manager_name')}</span>
            <input type="text" value={props.managerName} readOnly />
          </label>
          <label className="cb-field">
            <span>{L('count_date')}</span>
            <input type="text" value={props.today} readOnly />
          </label>
        </div>
        <label className="cb-field">
          <span>{L('comments')}</span>
          <textarea value={draft.comments} maxLength={2000} placeholder={L('comments_ph')} onChange={(e) => edit((d) => ({ ...d, comments: e.target.value }))} />
        </label>
      </section>

      <h2 className="cb-sec">{L('section_tills')}</h2>
      <div className="cb-tills">
        {setup.tills.map((t) => {
          const d = draft.tills[t.tillNumber]!;
          const counted = tillCounted(d);
          const v = counted !== null && ok(counted) ? counted - t.baseAmountCents : null;
          const state = v === null ? '' : v < 0 ? ' short' : ' ok';
          return (
            <div key={t.tillNumber} className={`card cb-till${state}`}>
              <div className="cb-tillhead">
                <b>{t.tillLabel}</b>
                <span>
                  {L('base_amount')}&nbsp;: {money(t.baseAmountCents)}
                </span>
              </div>
              <div className="cb-seg" role="group">
                <button type="button" aria-pressed={d.mode === 'total'} onClick={() => editTill(t.tillNumber, (x) => ({ ...x, mode: 'total' }))}>
                  {L('till_total_mode')}
                </button>
                <button type="button" aria-pressed={d.mode === 'detail'} onClick={() => editTill(t.tillNumber, (x) => ({ ...x, mode: 'detail' }))}>
                  {L('till_detail_mode')}
                </button>
              </div>
              {d.mode === 'total' ? (
                <label className="cb-field">
                  <span>{L('counted_amount')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={money(t.baseAmountCents)}
                    value={d.counted}
                    aria-invalid={bad(d.counted, amount) || undefined}
                    onChange={(e) => editTill(t.tillNumber, (x) => ({ ...x, counted: e.target.value }))}
                  />
                </label>
              ) : (
                <div className="cb-detail">
                  <p className="cb-mini">{L('section_paper')}</p>
                  {BILLS.map((b) => (
                    <PiecesRow
                      key={b}
                      label={billLabel(b, lang)}
                      count={{ label: L('bill_count'), value: d.bills[b] ?? '', bad: bad(d.bills[b] ?? '', whole), set: (v) => editTill(t.tillNumber, (x) => ({ ...x, bills: { ...x.bills, [b]: v } })) }}
                      total={money(whole(d.bills[b] ?? '') * b)}
                    />
                  ))}
                  <p className="cb-mini">{L('section_coins')}</p>
                  {COINS.map((c) => {
                    const p = d.coins[c.cents] ?? { rolls: '', loose: '' };
                    const setP = (patch: Partial<Pieces>) => editTill(t.tillNumber, (x) => ({ ...x, coins: { ...x.coins, [c.cents]: { ...p, ...patch } } }));
                    return (
                      <PiecesRow
                        key={c.cents}
                        label={coinLabel(c.cents, lang)}
                        rolls={{ label: L('rolls'), value: p.rolls, bad: bad(p.rolls, whole), set: (v) => setP({ rolls: v }) }}
                        count={{ label: L('loose'), value: p.loose, bad: bad(p.loose, whole), set: (v) => setP({ loose: v }) }}
                        total={money(whole(p.rolls) * c.rollCents + whole(p.loose) * c.cents)}
                      />
                    );
                  })}
                  <p className="cb-subtotal">
                    {L('counted_amount')}&nbsp;: {money(counted ?? 0)}
                  </p>
                </div>
              )}
              {v !== null && (
                <div className="cb-tillvar">
                  <div>
                    <span className={`cb-var ${v < 0 ? 'neg' : v > 0 ? 'pos' : 'zero'}`}>{signed(v)}</span>
                    <span className="cb-varlbl">{L(v < 0 ? 'till_short' : v > 0 ? 'till_over' : 'till_ok')}</span>
                  </div>
                  {v !== 0 &&
                    (d.fixed ? (
                      <button type="button" className="cb-fixed" onClick={() => editTill(t.tillNumber, (x) => ({ ...x, fixed: false }))}>
                        {L('fixed')}
                      </button>
                    ) : (
                      <button type="button" className="cb-fix" onClick={() => editTill(t.tillNumber, (x) => ({ ...x, fixed: true }))}>
                        {L('fix_it')}
                      </button>
                    ))}
                  {v !== 0 && d.fixed && <p className="cb-fixmsg">{L(v < 0 ? 'fix_it_msg' : 'fix_it_msg_over').replace('{amount}', money(Math.abs(v)))}</p>}
                  {v !== 0 && <p className={`cb-logged ${v < 0 ? 'neg' : 'pos'}`}>{L(v < 0 ? 'shortage_logged' : 'surplus_logged')}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="cb-sectotal">
        {L('tills_total')}&nbsp;: {money(totals.tillsT)}
      </p>

      <div className="cb-cols3">
        <section>
          <h2 className="cb-sec">{L('section_coins')}</h2>
          <div className="card">
            {COINS.map((c) => {
              const p = draft.coins[c.cents] ?? { rolls: '', loose: '' };
              const setP = (patch: Partial<Pieces>) => edit((d) => ({ ...d, coins: { ...d.coins, [c.cents]: { ...p, ...patch } } }));
              return (
                <PiecesRow
                  key={c.cents}
                  label={coinLabel(c.cents, lang)}
                  rolls={{ label: L('rolls'), value: p.rolls, bad: bad(p.rolls, whole), set: (v) => setP({ rolls: v }) }}
                  count={{ label: L('loose'), value: p.loose, bad: bad(p.loose, whole), set: (v) => setP({ loose: v }) }}
                  total={money(whole(p.rolls) * c.rollCents + whole(p.loose) * c.cents)}
                />
              );
            })}
            <p className="cb-subtotal">
              {L('coin_total')}&nbsp;: {money(totals.coinsT)}
            </p>
          </div>
        </section>

        <section>
          <h2 className="cb-sec">{L('section_paper')}</h2>
          <div className="card">
            {BILLS.map((b) => (
              <PiecesRow
                key={b}
                label={billLabel(b, lang)}
                count={{ label: L('bill_count'), value: draft.paper[b] ?? '', bad: bad(draft.paper[b] ?? '', whole), set: (v) => edit((d) => ({ ...d, paper: { ...d.paper, [b]: v } })) }}
                total={money(whole(draft.paper[b] ?? '') * b)}
              />
            ))}
            <p className="cb-subtotal">
              {L('bill_total')}&nbsp;: {money(totals.paperT)}
            </p>
          </div>
        </section>

        <section>
          <h2 className="cb-sec">{L('section_petty')}</h2>
          <div className="card">
            <div className="cb-seg" role="group">
              <button type="button" aria-pressed={draft.pettyMode === 'detail'} onClick={() => edit((d) => ({ ...d, pettyMode: 'detail' }))}>
                {L('petty_detail_mode')}
              </button>
              <button type="button" aria-pressed={draft.pettyMode === 'total'} onClick={() => edit((d) => ({ ...d, pettyMode: 'total' }))}>
                {L('petty_total_mode')}
              </button>
            </div>
            {draft.pettyMode === 'detail' ? (
              <>
                {draft.receipts.map((r, i) => {
                  const setR = (patch: Partial<typeof r>) => edit((d) => ({ ...d, receipts: d.receipts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                  return (
                    <div key={i} className="cb-receipt">
                      <input type="text" aria-label={L('receipt_desc')} placeholder={L('receipt_desc')} maxLength={200} value={r.description} onChange={(e) => setR({ description: e.target.value })} />
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={L('receipt_amount')}
                        placeholder="0,00"
                        value={r.amount}
                        aria-invalid={bad(r.amount, amount) || undefined}
                        onChange={(e) => setR({ amount: e.target.value })}
                      />
                      {draft.receipts.length > 1 && (
                        <button type="button" className="cb-x" aria-label={L('remove_receipt')} onClick={() => edit((d) => ({ ...d, receipts: d.receipts.filter((_, j) => j !== i) }))}>
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {draft.receipts.length < 50 && (
                  <button type="button" className="cb-ghost" onClick={() => edit((d) => ({ ...d, receipts: [...d.receipts, { description: '', amount: '' }] }))}>
                    {L('add_receipt')}
                  </button>
                )}
              </>
            ) : (
              <label className="cb-field">
                <span>{L('petty_total')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.pettyTotal}
                  aria-invalid={bad(draft.pettyTotal, amount) || undefined}
                  onChange={(e) => edit((d) => ({ ...d, pettyTotal: e.target.value }))}
                />
              </label>
            )}
            <p className="cb-subtotal">
              {L('petty_total')}&nbsp;: {money(totals.pettyT)}
            </p>
          </div>
        </section>
      </div>

      {guidance && (
        <section className="card warn cb-guide">
          <h2>{L('fix_guidance_title')}</h2>
          <p>
            {L('fix_safe_variance')}&nbsp;: <b className={`cb-var ${guidance.safeVarianceCents < 0 ? 'neg' : guidance.safeVarianceCents > 0 ? 'pos' : 'zero'}`}>{signed(guidance.safeVarianceCents)}</b>
          </p>
          {guidance.items.length > 0 && (
            <>
              <p className="cb-mini">{L('fix_per_till_actions')}</p>
              <ul>
                {guidance.items.map((i) => (
                  <li key={i.label} className={i.fixed ? 'done' : undefined}>
                    {i.label}&nbsp;: {L(i.varianceCents < 0 ? 'fix_take_from_intake' : 'fix_move_to_intake').replace('{amount}', money(Math.abs(i.varianceCents)))}{' '}
                    <span className={i.fixed ? 'cb-badge is-fixed' : 'cb-badge off'}>{L(i.fixed ? 'fixed' : 'not_fixed')}</span>
                  </li>
                ))}
              </ul>
              <p>
                {L('fix_net_intake_effect')}&nbsp;: <b>{signed(guidance.netIntakeCents)}</b>
              </p>
            </>
          )}
          {guidance.residualCents !== 0 ? (
            <p className="cb-alert neg">
              {L('fix_residual_non_till')}&nbsp;: {signed(guidance.residualCents)}. {L('fix_check_other_sections')}.
            </p>
          ) : (
            guidance.items.length > 0 && <p className="cb-alert ok">✓ {L('fix_all_balanced_after')}</p>
          )}
          {guidance.unfixed > 0 && <p className="cb-alert warn">{L('fix_use_fix_button')}</p>}
        </section>
      )}

      {props.canSendToAccountant && (
        <label className="cb-check">
          <input type="checkbox" checked={draft.sendToAccountant} onChange={(e) => edit((d) => ({ ...d, sendToAccountant: e.target.checked }))} />
          <span>
            {L('send_to_accountant')}
            <small>{L('send_to_accountant_hint')}</small>
          </span>
        </label>
      )}

      {error && (
        <p className="cb-error" role="alert">
          {L(error)}
        </p>
      )}

      {confirmCancel ? (
        <div className="cb-actions cb-confirm" role="alert">
          <p>{L('cancel_confirm')}</p>
          <button
            type="button"
            className="cb-danger"
            onClick={() => {
              try {
                localStorage.removeItem(key);
              } catch {}
              router.push('/cash');
            }}
          >
            {L('cancel_yes')}
          </button>
          <button type="button" className="cb-ghost" onClick={() => setConfirmCancel(false)}>
            {L('cancel_no')}
          </button>
        </div>
      ) : (
        <div className="cb-actions">
          <button type="button" className="cb-ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>
            {L('cancel_count')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {L(busy ? 'submitting' : 'submit_count')}
          </button>
        </div>
      )}

      <div className="cb-totalbar" aria-live="polite">
        <div>
          <span>{L('running_total')}</span>
          <b>{money(totals.grand)}</b>
        </div>
        <div className="mid">
          <span>{L('expected_total')}</span>
          <b>{money(setup.expectedTotalCents)}</b>
        </div>
        <div className="end">
          <span>{L('current_variance')}</span>
          <b className={`cb-var ${!ok(totals.variance) ? '' : totals.variance < 0 ? 'neg' : totals.variance > 0 ? 'pos' : 'zero'}`}>{signed(totals.variance)}</b>
        </div>
      </div>
    </div>
  );
}

function coinLabel(cents: number, lang: Lang) {
  return cents < 100 ? `${cents}¢` : lang === 'fr' ? `${cents / 100}$` : `$${cents / 100}`;
}
function billLabel(cents: number, lang: Lang) {
  return lang === 'fr' ? `${cents / 100}$` : `$${cents / 100}`;
}

interface Box {
  label: string;
  value: string;
  bad: boolean;
  set: (v: string) => void;
}
/** One denomination: its label, rolls (coins only), a count, and what they add up to. */
function PiecesRow({ label, rolls, count, total }: { label: string; rolls?: Box; count: Box; total: string }) {
  const box = (b: Box) => (
    <label className="cb-field">
      <span>{b.label}</span>
      <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={b.value} aria-invalid={b.bad || undefined} onChange={(e) => b.set(e.target.value)} />
    </label>
  );
  return (
    <div className="cb-denom">
      <b>{label}</b>
      {rolls ? box(rolls) : <span />}
      {box(count)}
      <span className="cb-denomtotal">{total}</span>
    </div>
  );
}

/** The previous count(s), App.html renderPreviousPanels. */
function PreviousPanels({ lang, counts, priorDay }: { lang: Lang; counts: PreviousCount[]; priorDay: boolean }) {
  const L = (k: CashKey) => ct(lang, k);
  const money = (c: number) => formatCents(c, lang);
  const signed = (c: number) => (c > 0 ? '+' : '') + money(c);
  return (
    <div className="cb-prev">
      {priorDay ? (
        <p className="cb-prevnote warn">
          {L('prev_from_prior_day')} ({counts[0]!.countDate})
        </p>
      ) : (
        counts.length > 1 && (
          <p className="cb-prevnote">
            {counts.length} {L('prev_counts_today')}
          </p>
        )
      )}
      {counts.map((p, i) => (
        <div key={p.id} className="cb-prevpanel">
          <div className="cb-prevtitle">
            <b>
              {counts.length > 1 ? `#${i + 1}, ` : ''}
              {p.managerName} · {p.countDate} {p.countTime}
            </b>
            <span className={p.varianceCents === 0 ? 'cb-badge ok' : 'cb-badge off'}>{p.varianceCents === 0 ? 'OK' : signed(p.varianceCents)}</span>
          </div>
          <dl className="cb-prevgrid">
            <div>
              <dt>{L('tills_total')}</dt>
              <dd>{money(p.tillsTotalCents)}</dd>
            </div>
            <div>
              <dt>{L('coins_total')}</dt>
              <dd>{money(p.coinsTotalCents)}</dd>
            </div>
            <div>
              <dt>{L('paper_total')}</dt>
              <dd>{money(p.paperTotalCents)}</dd>
            </div>
            <div>
              <dt>{L('petty_total_label')}</dt>
              <dd>{money(p.pettyCashTotalCents)}</dd>
            </div>
          </dl>
          <div className="cb-prevsum">
            <span>
              {L('grand_total')}&nbsp;: {money(p.grandTotalCents)}
            </span>
            <span className={`cb-var ${p.varianceCents < 0 ? 'neg' : p.varianceCents > 0 ? 'pos' : 'zero'}`}>
              {L('variance')}&nbsp;: {signed(p.varianceCents)}
            </span>
          </div>
          {p.tills
            .filter((t) => t.varianceCents !== 0 || t.wasFixed)
            .map((t) => (
              <div key={t.tillNumber} className="cb-prevtill">
                <span>
                  {t.tillLabel}&nbsp;: {money(t.countedAmountCents)}
                </span>
                <span>
                  <b className={`cb-var ${t.varianceCents < 0 ? 'neg' : t.varianceCents > 0 ? 'pos' : 'zero'}`}>{signed(t.varianceCents)}</b>{' '}
                  {t.wasShort && <span className={t.wasFixed ? 'cb-badge is-fixed' : 'cb-badge off'}>{L(t.wasFixed ? 'fixed' : 'not_fixed')}</span>}
                </span>
              </div>
            ))}
          {p.fixes.length > 0 && (
            <div className="cb-prevfixes">
              <p className="cb-mini">{L('till_fixes_title')}</p>
              {p.fixes.map((f) => (
                <p key={f.tillNumber}>
                  {L('till')} #{f.tillNumber}&nbsp;: {money(Math.abs(f.intakeDeltaCents))} {L(f.intakeDeltaCents < 0 ? 'taken_from_intake' : 'returned_to_intake')}
                </p>
              ))}
            </div>
          )}
          {p.comments && <p className="cb-prevcomment">{p.comments}</p>}
        </div>
      ))}
    </div>
  );
}
