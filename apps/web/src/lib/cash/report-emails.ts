/**
 * The two report emails (Reports.gs sendCountEmail_ / sendAccountantEmail_):
 *
 * - the restaurant's: the report itself as the email, with the count's files;
 * - the accountant's, when asked for: a short note in the count's language, with the
 *   report PDF and the count's files.
 *
 * Pure: what is sent is decided here and tested (report-emails.test.ts); sending is
 * reports.ts's job. Everything a person typed (comments, receipts, names) is ESCAPED:
 * the old report put comments and descriptions into its HTML as they were.
 */

import { formatCents } from '@hub/core';
import type { CountDetail } from './store';

export const SENDER_NAME = 'Cash balancing - Jacmar';
const FOOTER =
  'Ne répondez pas à ce message, cette boîte n’est pas surveillée. / Do not reply to this message, this mailbox is not monitored.';

export interface PlannedEmail {
  kind: 'restaurant' | 'accountant';
  /** Null when there is no address to send to: recorded, never guessed. */
  to: string | null;
  subject: string;
  text: string;
  html: string;
  /** The accountant gets the PDF; both get the count's files. */
  withPdf: boolean;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function planReportEmails(a: {
  count: CountDetail;
  restaurantName: string;
  lang: 'fr' | 'en';
  restaurant: { wanted: boolean; address: string | null };
  accountant: { wanted: boolean; address: string | null };
}): PlannedEmail[] {
  const { count: c, lang } = a;
  const fr = lang === 'fr';
  const t = (f: string, e: string) => (fr ? f : e);
  const m = (n: number) => formatCents(n, lang);
  const signed = (n: number) => (n > 0 ? '+' : '') + m(n);
  const when = `${c.countDate} ${c.countTime}`;
  const out: PlannedEmail[] = [];

  if (a.restaurant.wanted) {
    const subject = `${c.varianceCents === 0 ? '✅' : '⚠️'} ${t('Décompte du coffre', 'Safe count')} · ${a.restaurantName} · ${when} · ${signed(c.varianceCents)}`;
    out.push({
      kind: 'restaurant',
      to: a.restaurant.address,
      subject,
      text: reportText(a.count, a.restaurantName, lang),
      html: reportHtml(a.count, a.restaurantName, lang),
      withPdf: false,
    });
  }

  if (a.accountant.wanted) {
    const manager = c.managerName || '–';
    const text = fr
      ? `Bonjour,\n\nVeuillez trouver ci-joint le décompte du coffre pour :\n\n  • Restaurant : ${a.restaurantName}\n  • Date : ${when}\n  • Gérant : ${manager}\n  • Total compté : ${m(c.grandTotalCents)}\n  • Écart : ${signed(c.varianceCents)}\n\nCe rapport a été envoyé par ${manager} via le système Cash Balancing.\n\n${FOOTER}`
      : `Hello,\n\nPlease find attached the safe count report for:\n\n  • Restaurant: ${a.restaurantName}\n  • Date: ${when}\n  • Manager: ${manager}\n  • Counted total: ${m(c.grandTotalCents)}\n  • Variance: ${signed(c.varianceCents)}\n\nThis report was sent by ${manager} via the Cash Balancing system.\n\n${FOOTER}`;
    out.push({
      kind: 'accountant',
      to: a.accountant.address,
      subject: `${t('Comptabilité · Décompte du coffre', 'Accounting · Safe count')} · ${a.restaurantName} · ${when}`,
      text,
      html: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#333;white-space:pre-wrap">${escapeHtml(text)}</div>`,
      withPdf: true,
    });
  }
  return out;
}

/** The report as plain text, for mail clients that show no HTML. */
function reportText(c: CountDetail, name: string, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr';
  const t = (f: string, e: string) => (fr ? f : e);
  const m = (n: number) => formatCents(n, lang);
  const signed = (n: number) => (n > 0 ? '+' : '') + m(n);
  const lines = [
    `${t('Décompte du coffre', 'Safe count')}, ${name}, ${c.countDate} ${c.countTime}`,
    `${t('Gérant', 'Manager')} : ${c.managerName || '–'}`,
    `${t('Total compté', 'Counted total')} : ${m(c.grandTotalCents)}`,
    `${t('Total attendu', 'Expected total')} : ${m(c.expectedTotalCents)}`,
    `${t('Écart', 'Variance')} : ${signed(c.varianceCents)}`,
    '',
    `${t('Caisses', 'Tills')} : ${m(c.tillsTotalCents)}`,
    ...c.tills.map((x) => `  ${x.tillLabel} : ${m(x.countedAmountCents)} (${signed(x.varianceCents)})${x.wasFixed ? ` ${t('corrigé', 'fixed')}` : ''}`),
    `${t('Monnaie', 'Coins')} : ${m(c.coinsTotalCents)}`,
    `${t('Billets', 'Bills')} : ${m(c.paperTotalCents)}`,
    `${t('Petite caisse', 'Petty cash')} : ${m(c.pettyCashTotalCents)}`,
    ...c.pettyCash.map((p) => `  ${p.description ?? '–'} : ${m(p.amountCents)}`),
    ...(c.comments ? ['', `${t('Commentaires', 'Comments')} : ${c.comments}`] : []),
    '',
    FOOTER,
  ];
  return lines.join('\n');
}

/** The report as the email itself (Reports.gs buildReportHtml_), inline styles for mail clients. */
function reportHtml(c: CountDetail, name: string, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr';
  const t = (f: string, e: string) => (fr ? f : e);
  const m = (n: number) => escapeHtml(formatCents(n, lang));
  const signed = (n: number) => (n > 0 ? '+' : '') + m(n);
  const tone = (n: number) => (n === 0 ? '#2E7D32' : '#C62828');
  const e = escapeHtml;
  const h3 = (s: string) => `<h3 style="margin:0 0 10px;font-size:15px;color:#292929">${s}</h3>`;
  const td = 'padding:5px 0;border-bottom:1px solid #eee';
  const tillRows = c.tills
    .map(
      (x) =>
        `<tr><td style="${td}">${e(x.tillLabel)}</td><td style="${td};text-align:right">${m(x.baseAmountCents)}</td><td style="${td};text-align:right">${m(x.countedAmountCents)}</td><td style="${td};text-align:right;font-weight:700;color:${tone(x.varianceCents)}">${signed(x.varianceCents)}</td><td style="${td};text-align:center">${x.wasFixed ? t('Oui', 'Yes') : x.wasShort ? t('Non', 'No') : '–'}</td></tr>`,
    )
    .join('');
  const coinRows = c.coins
    .map((x) => `<tr><td style="${td}">${m(x.denominationCents)}</td><td style="${td};text-align:right">${x.rolls} ${t('rouleaux', 'rolls')}</td><td style="${td};text-align:right">${x.looseCount} ${t('pièces', 'loose')}</td><td style="${td};text-align:right;font-weight:700">${m(x.totalCents)}</td></tr>`)
    .join('');
  const paperRows = c.paper.map((x) => `<tr><td style="${td}">${m(x.denominationCents)}</td><td style="${td};text-align:right">${x.count}×</td><td style="${td};text-align:right;font-weight:700">${m(x.totalCents)}</td></tr>`).join('');
  const pettyRows = c.pettyCash.length
    ? c.pettyCash.map((p) => `<tr><td style="${td}">${e(p.description ?? '–')}</td><td style="${td};text-align:right;font-weight:700">${m(p.amountCents)}</td></tr>`).join('')
    : `<tr><td style="color:#999">${t('Aucun reçu', 'No receipts')}</td></tr>`;
  const fixes = c.fixes.length
    ? `<div style="padding:16px 24px;background:#fff3e0;border-left:4px solid #FF9800">${h3(`<span style="color:#E65100">${t('Corrections de caisses', 'Till fixes')}</span>`)}${c.fixes
        .map((f) => `<div style="font-size:13px;padding:3px 0">${t('Caisse', 'Till')} #${f.tillNumber} : ${m(Math.abs(f.intakeDeltaCents))} ${f.intakeDeltaCents < 0 ? t('prélevé de l’encaisse du jour', 'taken from cash intake') : t('remis à l’encaisse du jour', 'returned to cash intake')}</div>`)
        .join('')}</div>`
    : '';
  const comments = c.comments ? `<div style="padding:16px 24px;background:#fff">${h3(t('Commentaires', 'Comments'))}<div style="font-size:13px;white-space:pre-wrap">${e(c.comments)}</div></div>` : '';
  const files = c.attachments.length
    ? `<div style="padding:16px 24px;background:#fff">${h3(t('Pièces jointes', 'Attachments'))}${c.attachments.map((a) => `<div style="font-size:13px;padding:2px 0">${e(a.fileName)}</div>`).join('')}</div>`
    : '';
  const table = (rows: string) => `<table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>`;
  return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:700px;margin:0 auto;color:#333">
<div style="background:#292929;color:#F5F5F5;padding:20px 24px;border-radius:8px 8px 0 0"><div style="font-size:20px;font-weight:800">${t('Décompte du coffre', 'Safe Count Report')}</div><div style="font-size:13px;color:#9E9E9E">${e(name)}, ${e(c.countDate)} ${e(c.countTime)}</div></div>
<table style="width:100%;background:#232323;color:#F5F5F5;padding:12px 24px"><tr>
<td><div style="font-size:11px;color:#9E9E9E;text-transform:uppercase">${t('Gérant', 'Manager')}</div><div style="font-weight:700">${e(c.managerName || '–')}</div></td>
<td style="text-align:center"><div style="font-size:11px;color:#9E9E9E;text-transform:uppercase">${t('Total compté', 'Counted total')}</div><div style="font-weight:900;font-size:20px">${m(c.grandTotalCents)}</div></td>
<td style="text-align:right"><div style="font-size:11px;color:#9E9E9E;text-transform:uppercase">${t('Écart', 'Variance')}</div><div style="font-weight:900;font-size:20px;color:${c.varianceCents === 0 ? '#4CAF50' : '#EF5350'}">${signed(c.varianceCents)}</div></td>
</tr></table>
<div style="padding:16px 24px;background:#fff">${h3(`${t('Caisses', 'Tills')}, ${m(c.tillsTotalCents)}`)}${table(`<tr><th style="text-align:left">${t('Caisse', 'Till')}</th><th style="text-align:right">Base</th><th style="text-align:right">${t('Compté', 'Counted')}</th><th style="text-align:right">${t('Écart', 'Variance')}</th><th>${t('Corrigé', 'Fixed')}</th></tr>${tillRows}`)}</div>
<div style="padding:16px 24px;background:#fafafa">${h3(`${t('Monnaie', 'Coins')}, ${m(c.coinsTotalCents)}`)}${table(coinRows)}</div>
<div style="padding:16px 24px;background:#fff">${h3(`${t('Billets', 'Bills')}, ${m(c.paperTotalCents)}`)}${table(paperRows)}</div>
<div style="padding:16px 24px;background:#fafafa">${h3(`${t('Petite caisse', 'Petty cash')}, ${m(c.pettyCashTotalCents)}`)}${table(pettyRows)}</div>
${fixes}${comments}${files}
<div style="padding:16px 24px;background:#292929;color:#9E9E9E;font-size:11px;text-align:center;border-radius:0 0 8px 8px">${FOOTER}</div>
</div>`;
}
