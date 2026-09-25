import { describe, expect, it } from 'vitest';
import { businessDate, businessTime, formatCents, normalizeEmail, parseCents, sumCents, torontoWallClock } from './index';

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

describe('torontoWallClock: a spreadsheet timestamp back to a real instant', () => {
  const iso = (d: Date) => d.toISOString();

  it('reads a summer time as EDT (UTC-4)', () => {
    // A count filed at 18:36:14 in April is 22:36:14 UTC.
    expect(iso(torontoWallClock(2026, 4, 8, 18, 36, 14))).toBe('2026-04-08T22:36:14.000Z');
  });

  it('reads a winter time as EST (UTC-5)', () => {
    expect(iso(torontoWallClock(2026, 1, 15, 23, 59))).toBe('2026-01-16T04:59:00.000Z');
  });

  it('round-trips through businessDate / businessTime, late evening included', () => {
    const at = torontoWallClock(2026, 10, 1, 21, 30);
    expect(businessDate(at)).toBe('2026-10-01');
    expect(businessTime(at)).toBe('21:30');
  });

  it('takes the first 01:30 on the night the clocks go back', () => {
    // 2026-11-01: 01:30 EDT (05:30 UTC) happens, then 01:30 EST (06:30 UTC).
    expect(iso(torontoWallClock(2026, 11, 1, 1, 30))).toBe('2026-11-01T05:30:00.000Z');
  });

  it('either side of the spring jump', () => {
    // 2026-03-08: 01:59 EST is 06:59 UTC; 03:00 EDT is 07:00 UTC.
    expect(iso(torontoWallClock(2026, 3, 8, 1, 59))).toBe('2026-03-08T06:59:00.000Z');
    expect(iso(torontoWallClock(2026, 3, 8, 3, 0))).toBe('2026-03-08T07:00:00.000Z');
    // 02:30 never happened; read with the EST offset, i.e. 03:30 EDT.
    expect(iso(torontoWallClock(2026, 3, 8, 2, 30))).toBe('2026-03-08T07:30:00.000Z');
  });
});
