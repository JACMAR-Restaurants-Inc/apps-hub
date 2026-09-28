import { describe, expect, it } from 'vitest';
import { planReportEmails } from './report-emails';
import type { CountDetail } from './store';

const count: CountDetail = {
  id: 7,
  restaurantId: '1647',
  managerName: 'Gérant <b>Test</b>',
  countDate: '2026-09-28',
  countTime: '21:05',
  comments: '<script>alert(1)</script> & co',
  tillsTotalCents: 24500,
  coinsTotalCents: 0,
  paperTotalCents: 0,
  pettyCashTotalCents: 450,
  grandTotalCents: 24950,
  expectedTotalCents: 25000,
  varianceCents: -50,
  language: 'fr',
  pdfUrl: null,
  tills: [{ tillNumber: 1, tillLabel: 'Caisse 1', baseAmountCents: 25000, countedAmountCents: 24500, varianceCents: -500, wasShort: true, wasFixed: true, fixAmountFromIntakeCents: 500 }],
  fixes: [{ tillNumber: 1, intakeDeltaCents: -500 }],
  coins: [],
  paper: [],
  pettyCash: [{ description: '"Lait" <img src=x onerror=alert(1)>', amountCents: 450 }],
  attachments: [{ id: 1, fileName: '<x>.jpg', mimeType: 'image/jpeg', fileSize: 10 }],
};
const plan = (restaurant: { wanted: boolean; address: string | null } = { wanted: true, address: 'hull@example.com' }, accountant = { wanted: false, address: 'compta@example.com' as string | null }) =>
  planReportEmails({ count, restaurantName: 'Hull', lang: 'fr', restaurant, accountant });

describe('planReportEmails', () => {
  it('the restaurant gets the report as the email, flagged when the safe is off', () => {
    const [r] = plan();
    expect(r).toMatchObject({ kind: 'restaurant', to: 'hull@example.com', withPdf: false });
    expect(r!.subject.replace(/\s/g, ' ')).toBe('⚠️ Décompte du coffre · Hull · 2026-09-28 21:05 · -0,50 $');
    expect(r!.html).toContain('Caisse 1');
  });

  it('the accountant only when asked, in the count’s language, with the PDF', () => {
    expect(plan().map((e) => e.kind)).toEqual(['restaurant']);
    const both = plan(undefined, { wanted: true, address: 'compta@example.com' });
    expect(both.map((e) => e.kind)).toEqual(['restaurant', 'accountant']);
    expect(both[1]).toMatchObject({ to: 'compta@example.com', withPdf: true });
    expect(both[1]!.text).toContain('Veuillez trouver ci-joint le décompte du coffre');
    // "Envoyer à la comptabilité" on a filed count: the accountant alone.
    expect(plan({ wanted: false, address: 'hull@example.com' }, { wanted: true, address: 'compta@example.com' }).map((e) => e.kind)).toEqual(['accountant']);
  });

  it('no address is recorded as none, never guessed', () => {
    expect(plan({ wanted: true, address: null })[0]!.to).toBeNull();
  });

  it('escapes everything a person typed', () => {
    const html = plan(undefined, { wanted: true, address: 'c@x.com' }).map((e) => e.html).join('');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Test</b>');
    expect(html).not.toContain('<x>.jpg');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
  });
});
