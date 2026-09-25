import { describe, expect, it } from 'vitest';
import { businessDate, businessTime, formatCents, normalizeEmail, parseCents, sumCents } from './index';

describe('money', () => {
  it('parses what a person types, in either language', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('12,50')).toBe(1250);
    expect(parseCents('1 234,56 $')).toBe(123456);
    expect(parseCents('$1234.56')).toBe(123456);
    expect(parseCents('-5,05')).toBe(-505);
    expect(parseCents('0.10')).toBe(10);
  });

  it('refuses what is not an amount rather than guessing', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('1.234')).toBeNull(); // three decimals: ambiguous, refuse
    expect(parseCents(Number.NaN)).toBeNull(); // the old app's NaN-kills-the-response bug
  });

  it('never drifts on the sum that floats get wrong', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30);
    expect(() => sumCents([10, 0.5])).toThrow();
  });

  it('formats for the reader', () => {
    expect(formatCents(123456, 'en')).toBe('$1,234.56');
    // fr-CA uses narrow no-break spaces; compare with spaces normalised.
    expect(formatCents(123456, 'fr').replace(/[  ]/g, ' ')).toBe('1 234,56 $');
  });
});

describe('business time is Toronto time', () => {
  it('a 9pm Toronto count is still today, though UTC has rolled over', () => {
    // 2026-10-02 01:30 UTC = 2026-10-01 21:30 in Toronto (EDT, UTC-4).
    const at = new Date('2026-10-02T01:30:00Z');
    expect(businessDate(at)).toBe('2026-10-01');
    expect(businessTime(at)).toBe('21:30');
  });

  it('follows the winter offset too', () => {
    // 2026-12-15 04:59 UTC = 23:59 in Toronto (EST, UTC-5).
    const at = new Date('2026-12-15T04:59:00Z');
    expect(businessDate(at)).toBe('2026-12-14');
    expect(businessTime(at)).toBe('23:59');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims for everyone', () => {
    expect(normalizeEmail('  Jane.Doe@Hotmail.com ')).toBe('jane.doe@hotmail.com');
  });

  it('strips dots for Gmail only', () => {
    expect(normalizeEmail('jane.doe@gmail.com')).toBe('janedoe@gmail.com');
    expect(normalizeEmail('Jane.Doe@googlemail.com')).toBe('janedoe@gmail.com');
  });

  it('keeps dots elsewhere: two Yahoo addresses are two people', () => {
    expect(normalizeEmail('jane.doe@yahoo.com')).not.toBe(normalizeEmail('janedoe@yahoo.com'));
  });
});
