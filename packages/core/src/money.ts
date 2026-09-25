/**
 * Money is INTEGER CENTS everywhere: in the database, in memory, across the wire.
 *
 * Floating-point dollars cannot represent 0.10 exactly, and this is a cash app whose
 * whole product is a variance. A count that is "off by $0.0000000001" is a bug report
 * nobody can explain. Convert at the edges only: parse what a person typed, format
 * what a person reads.
 */

export type Cents = number;

/** Parse a typed amount ("12", "12.5", "12,50", "1 234,56 $") into cents. null if not an amount. */
export function parseCents(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  // French uses a comma decimal and a (narrow) space as thousands separator.
  const cleaned = input
    .replace(/[\s  $]/g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole = '0', frac = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Format cents for display in the reader's language: "1 234,56 $" (fr) or "$1,234.56" (en). */
export function formatCents(cents: Cents, lang: 'fr' | 'en'): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

/** Sum without ever leaving integers. Throws on a non-integer so a float cannot sneak in. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`not cents: ${v}`);
    total += v;
  }
  return total;
}
