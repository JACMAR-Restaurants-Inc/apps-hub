import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderReportPdf } from './report-pdf';
import type { CountDetail } from './store';

const count: CountDetail = {
  id: 999,
  restaurantId: '1647',
  managerName: 'Émilie Côté',
  countDate: '2026-09-28',
  countTime: '21:05',
  comments: 'Reçu de lait manquant; vérifié deux fois.',
  tillsTotalCents: 149750,
  coinsTotalCents: 415,
  paperTotalCents: 20000,
  pettyCashTotalCents: 450,
  grandTotalCents: 170615,
  expectedTotalCents: 510000,
  varianceCents: -339385,
  language: 'fr',
  pdfUrl: null,
  tills: [1, 2, 3, 4, 5, 6].map((n) => ({
    tillNumber: n,
    tillLabel: `Caisse ${n}`,
    baseAmountCents: 25000,
    countedAmountCents: n === 1 ? 24500 : 25000,
    varianceCents: n === 1 ? -500 : 0,
    wasShort: n === 1,
    wasFixed: n === 1,
    fixAmountFromIntakeCents: n === 1 ? 500 : 0,
  })),
  fixes: [{ tillNumber: 1, intakeDeltaCents: -500 }],
  coins: [{ denominationCents: 5, rolls: 2, looseCount: 3, totalCents: 415 }],
  paper: [{ denominationCents: 2000, count: 10, totalCents: 20000 }],
  pettyCash: [{ description: 'Lait', amountCents: 450 }],
  attachments: [],
};

async function onePagePdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage();
  return d.save();
}

describe('renderReportPdf', () => {
  it('draws the report, in French, as a PDF', async () => {
    const pdf = await renderReportPdf({ count, restaurantName: 'Hull', lang: 'fr', files: [] });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('Hull');
  }, 30_000);

  it('adds attached PDFs at the end, and survives one that is not a PDF at all', async () => {
    const alone = await PDFDocument.load(await renderReportPdf({ count, restaurantName: 'Hull', lang: 'en', files: [] }));
    const merged = await renderReportPdf({
      count,
      restaurantName: 'Hull',
      lang: 'en',
      files: [
        { fileName: 'receipt.pdf', mimeType: 'application/pdf', bytes: await onePagePdf() },
        { fileName: 'broken.pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-not really') },
        { fileName: 'gone.jpg', mimeType: 'image/jpeg', bytes: null },
      ],
    });
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(alone.getPageCount() + 1);
  }, 30_000);
});
