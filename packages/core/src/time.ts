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

/**
 * The instant at which Toronto's clocks read the given wall-clock time.
 *
 * For the spreadsheet import: Sheets stores a timestamp as a bare wall-clock time in
 * the spreadsheet's zone (Toronto), and the xlsx reader hands it back as if it were UTC.
 * Reading it as UTC would put every imported timestamp 4 or 5 hours early.
 *
 * In the autumn, when 01:00-01:59 happens twice, the first (daylight) one is chosen.
 * In the spring, a time in the skipped hour (02:00-02:59) is read with the offset in
 * force before the jump, landing an hour later on the clock; nothing real was
 * stamped in an hour that did not exist.
 */
export function torontoWallClock(y: number, month: number, d: number, h = 0, mi = 0, s = 0): Date {
  const asUtc = Date.UTC(y, month - 1, d, h, mi, s);
  // The offsets in force a day either side: the real instant is hours away from
  // asUtc, so sampling nearer can miss a change between them. Earliest instant first;
  // keep the first whose Toronto clock reading matches.
  const offsets = [...new Set([offsetMinutes(asUtc - 86_400_000), offsetMinutes(asUtc + 86_400_000)])].sort(
    (a, b) => b - a,
  );
  for (const off of offsets) {
    const candidate = asUtc - off * 60_000;
    if (offsetMinutes(candidate) === off) return new Date(candidate);
  }
  return new Date(asUtc - offsets[offsets.length - 1]! * 60_000);
}

/** Toronto's offset from UTC, in minutes (e.g. -240 in summer), at an instant. */
function offsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((wall - Math.floor(at / 1000) * 1000) / 60_000);
}
