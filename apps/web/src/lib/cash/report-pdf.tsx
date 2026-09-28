import 'server-only';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { formatCents } from '@hub/core';
import type { CountDetail } from './store';

/**
 * A count's report as a PDF: the same content and look as the old app's report
 * (Reports.gs buildReportHtml_: the charcoal header with the gold mark, the summary
 * band, tills, coins, bills, petty cash, till fixes, comments, photos), drawn with
 * @react-pdf/renderer instead of Apps Script's HTML-to-PDF, which only exists there.
 * PDFs attached to the count are added at the end with pdf-lib, which is what the
 * separate jacmar-pdf-merge Cloud Function did.
 *
 * Owner's call, 2026-09-28: the PDF is a key feature and must be in the demo; the
 * method may change after approval. Everything here is behind renderReportPdf().
 */

export interface ReportInput {
  count: CountDetail;
  restaurantName: string;
  lang: 'fr' | 'en';
  /** The count's attachments, with their bytes where they could be read. */
  files: { fileName: string; mimeType: string; bytes: Uint8Array | null }[];
}

export const FOOTER =
  'Do not reply to this message, this mailbox is not monitored. / Ne répondez pas à ce message, cette boîte n’est pas surveillée.';

// The built-in PDF fonts cover French accents but not the narrow no-break space
// Intl puts in "1 234,56 $"; a plain no-break space prints the same.
const money = (c: number, lang: 'fr' | 'en') => formatCents(c, lang).replace(/ /g, ' ');
const signed = (c: number, lang: 'fr' | 'en') => (c > 0 ? '+' : '') + money(c, lang);

const C = { charcoal: '#292929', card: '#232323', gold: '#FFC72C', text: '#F5F5F5', muted: '#9E9E9E', green: '#2E7D32', red: '#C62828', orange: '#E65100', line: '#E0E0E0' };
const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#333333' },
  head: { backgroundColor: C.charcoal, color: C.text, padding: 16, borderTopLeftRadius: 6, borderTopRightRadius: 6, flexDirection: 'row', alignItems: 'center' },
  mark: { width: 30, height: 30, borderRadius: 7, backgroundColor: C.gold, color: C.charcoal, fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 5, marginRight: 10 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 10, color: C.muted, marginTop: 2 },
  band: { backgroundColor: C.card, color: C.text, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' },
  lbl: { fontSize: 8, color: C.muted, textTransform: 'uppercase' },
  big: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  section: { paddingVertical: 10, paddingHorizontal: 16 },
  h3: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.charcoal, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold' },
  fixes: { backgroundColor: '#FFF3E0', borderLeftWidth: 3, borderLeftColor: '#FF9800' },
  foot: { position: 'absolute', bottom: 16, left: 32, right: 32, fontSize: 7, color: '#9E9E9E', textAlign: 'center' },
  photo: { maxWidth: 480, maxHeight: 340, objectFit: 'contain', marginTop: 4, marginBottom: 10 },
});

function Report({ count: c, restaurantName, lang, files }: ReportInput) {
  const fr = lang === 'fr';
  const t = (f: string, e: string) => (fr ? f : e);
  const m = (n: number) => money(n, lang);
  const photos = files.filter((f) => f.bytes && (f.mimeType === 'image/jpeg' || f.mimeType === 'image/png'));
  return (
    <Document title={`${t('Décompte du coffre', 'Safe Count Report')} ${restaurantName} ${c.countDate} ${c.countTime}`} author="Cash Balancing" language={lang === 'fr' ? 'fr-CA' : 'en-CA'}>
      <Page size="LETTER" style={s.page}>
        <View style={s.head}>
          <Text style={s.mark}>$</Text>
          <View>
            <Text style={s.title}>{t('Décompte du coffre', 'Safe Count Report')}</Text>
            <Text style={s.sub}>
              {restaurantName} ({c.restaurantId}), {c.countDate} {c.countTime}
            </Text>
          </View>
        </View>
        <View style={s.band}>
          <View>
            <Text style={s.lbl}>{t('Gérant', 'Manager')}</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 2 }}>{c.managerName || '–'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.lbl}>{t('Total compté', 'Counted total')}</Text>
            <Text style={s.big}>{m(c.grandTotalCents)}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.lbl}>{t('Total attendu', 'Expected total')}</Text>
            <Text style={[s.big, { color: C.muted }]}>{m(c.expectedTotalCents)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.lbl}>{t('Écart', 'Variance')}</Text>
            <Text style={[s.big, { color: c.varianceCents === 0 ? '#4CAF50' : '#EF5350' }]}>{signed(c.varianceCents, lang)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h3} minPresenceAhead={60}>
            {t('Caisses', 'Tills')}, {m(c.tillsTotalCents)}
          </Text>
          <View style={[s.row, { borderBottomWidth: 2 }]}>
            <Text style={[s.th, { flex: 2 }]}>{t('Caisse', 'Till')}</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Base</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>{t('Compté', 'Counted')}</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>{t('Écart', 'Variance')}</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>{t('Corrigé', 'Fixed')}</Text>
          </View>
          {c.tills.map((x) => (
            <View key={x.tillNumber} style={s.row} wrap={false}>
              <Text style={{ flex: 2 }}>{x.tillLabel}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{m(x.baseAmountCents)}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{m(x.countedAmountCents)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: x.varianceCents === 0 ? C.green : C.red }}>{signed(x.varianceCents, lang)}</Text>
              <Text style={{ flex: 1, textAlign: 'center' }}>{x.wasFixed ? t('Oui', 'Yes') : x.wasShort ? t('Non', 'No') : '–'}</Text>
            </View>
          ))}
        </View>

        <View style={[s.section, { backgroundColor: '#FAFAFA' }]} wrap={false}>
          <Text style={s.h3}>
            {t('Monnaie', 'Coins')}, {m(c.coinsTotalCents)}
          </Text>
          {c.coins.map((x) => (
            <View key={x.denominationCents} style={s.row}>
              <Text style={{ flex: 1 }}>{m(x.denominationCents)}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>
                {x.rolls} {t('rouleaux', 'rolls')}
              </Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>
                {x.looseCount} {t('pièces', 'loose')}
              </Text>
              <Text style={{ flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{m(x.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h3}>
            {t('Billets', 'Bills')}, {m(c.paperTotalCents)}
          </Text>
          {c.paper.map((x) => (
            <View key={x.denominationCents} style={s.row}>
              <Text style={{ flex: 1 }}>{m(x.denominationCents)}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{x.count}×</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{m(x.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={[s.section, { backgroundColor: '#FAFAFA' }]} wrap={false}>
          <Text style={s.h3}>
            {t('Petite caisse', 'Petty cash')}, {m(c.pettyCashTotalCents)}
          </Text>
          {c.pettyCash.length ? (
            c.pettyCash.map((x, i) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 3 }}>{x.description ?? '–'}</Text>
                <Text style={{ flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{m(x.amountCents)}</Text>
              </View>
            ))
          ) : (
            <Text style={{ color: '#999999' }}>{t('Aucun reçu', 'No receipts')}</Text>
          )}
        </View>

        {c.fixes.length > 0 && (
          <View style={[s.section, s.fixes]} wrap={false}>
            <Text style={[s.h3, { color: C.orange }]}>{t('Corrections de caisses', 'Till fixes')}</Text>
            {c.fixes.map((f) => (
              <Text key={f.tillNumber} style={{ paddingVertical: 2 }}>
                {t('Caisse', 'Till')} #{f.tillNumber} : {m(Math.abs(f.intakeDeltaCents))}{' '}
                {f.intakeDeltaCents < 0 ? t('prélevé de l’encaisse du jour', 'taken from cash intake') : t('remis à l’encaisse du jour', 'returned to cash intake')}
              </Text>
            ))}
          </View>
        )}

        {c.comments && (
          <View style={s.section} wrap={false}>
            <Text style={s.h3}>{t('Commentaires', 'Comments')}</Text>
            <Text>{c.comments}</Text>
          </View>
        )}

        {files.length > 0 && (
          <View style={s.section}>
            <Text style={s.h3} minPresenceAhead={60}>
              {t('Pièces jointes', 'Attachments')}
            </Text>
            {files.map((f, i) => (
              <Text key={i} style={{ color: '#666666', paddingVertical: 1 }}>
                {f.fileName}
                {f.mimeType === 'application/pdf' ? t(' (ajouté à la fin de ce document)', ' (added at the end of this document)') : ''}
                {!f.bytes ? t(' (non disponible)', ' (unavailable)') : ''}
              </Text>
            ))}
            {photos.map((f, i) => (
              <View key={`p${i}`} wrap={false}>
                <Text style={{ fontSize: 8, color: '#666666', marginTop: 6 }}>{f.fileName}</Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf's Image, not an HTML img */}
                <Image style={s.photo} src={{ data: Buffer.from(f.bytes!), format: f.mimeType === 'image/png' ? 'png' : 'jpg' }} />
              </View>
            ))}
          </View>
        )}

        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `${FOOTER}   ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

/** The report PDF, with the count's PDF attachments added at the end. */
export async function renderReportPdf(input: ReportInput): Promise<Uint8Array> {
  const main = await renderToBuffer(<Report {...input} />);
  const extra = input.files.filter((f) => f.mimeType === 'application/pdf' && f.bytes);
  if (!extra.length) return new Uint8Array(main);
  const doc = await PDFDocument.load(main);
  for (const f of extra) {
    try {
      const other = await PDFDocument.load(f.bytes!, { ignoreEncryption: true });
      const pages = await doc.copyPages(other, other.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    } catch (e) {
      // One unreadable PDF must not cost the report: it is still listed and still attached to the emails.
      console.error('renderReportPdf: could not append', f.fileName, e);
    }
  }
  return doc.save();
}
