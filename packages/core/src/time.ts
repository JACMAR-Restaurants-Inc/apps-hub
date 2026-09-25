/**
 * Business dates are TORONTO dates, decided on the SERVER.
 *
 * A count's date and time come from the server clock at the moment it is filed, never
 * from the browser. The old app stamped count_time when the count screen OPENED and a
 * manager who took ten minutes filed a count dated before one submitted after it
 * (safe-count-tracker CLAUDE.md §8). A server running in UTC would put a 9pm count on
 * tomorrow's date. Both mistakes are one line away, so both go through here.
 */

export const BUSINESS_TZ = 'America/Toronto';

/** 'YYYY-MM-DD' for the given instant, in Toronto. */
export function businessDate(at: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** 'HH:MM' (24h) for the given instant, in Toronto. */
export function businessTime(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}
