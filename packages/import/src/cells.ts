/**
 * Reading one spreadsheet cell as one database value.
 *
 * Every reader either returns a value or records a Problem naming the tab, row and
 * column, and the import refuses to write anything while there is one. Nothing is
 * guessed: a blank is not zero, 150.005 is not $150.01, and "Yes " is not "yes".
 *
 * What the xlsx reader hands back (see workbook.ts):
 * - Numbers as floats: 41.49 arrives as 41.489999999999995.
 * - Dates and times as JS Dates whose UTC fields are Toronto WALL-CLOCK readings.
 *   Sheets stores no zone; the spreadsheets are in America/Toronto.
 * - A time of day as 1899-12-30 plus the time.
 * - Hyperlinks as { text, hyperlink }; formula errors as { error: '#ERROR!' }.
 */

import { torontoWallClock } from '@hub/core';

export type Cell = string | number | boolean | Date | null | { text: string; hyperlink: string } | { error: string };

export interface Problem {
  tab: string;
  row: number;
  column: string;
  message: string;
}

/** Where a value came from, so a problem can say exactly which cell to look at. */
export interface At {
  tab: string;
  /** The spreadsheet's own row number (the header is row 1). */
  row: number;
  problems: Problem[];
}

const isBlank = (v: Cell | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function fail(at: At, column: string, message: string): null {
  at.problems.push({ tab: at.tab, row: at.row, column, message });
  return null;
}

/** Text, trimmed. Blank is null. A formula error is kept as the sheet shows it. */
export function text(at: At, column: string, v: Cell | undefined): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return fail(at, column, 'expected text, found a date');
  if (typeof v === 'object' && v !== null) return 'error' in v ? v.error : v.text.trim() || null;
  return String(v).trim();
}

export function requiredText(at: At, column: string, v: Cell | undefined): string {
  const t = text(at, column, v);
  if (t === null) fail(at, column, 'blank');
  return t ?? '';
}

/** A hyperlink's target (the pdf_url column), or plain text that is a URL. */
export function url(at: At, column: string, v: Cell | undefined): string | null {
  if (isBlank(v)) return null;
  if (typeof v === 'object' && v !== null && 'hyperlink' in v) return v.hyperlink;
  return text(at, column, v);
}

/** A whole number. Blank is a problem unless the caller allows it. */
export function int(at: At, column: string, v: Cell | undefined): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  fail(at, column, isBlank(v) ? 'blank' : 'expected a whole number');
  return 0;
}

/** Positive whole number: an id. */
export function id(at: At, column: string, v: Cell | undefined): number {
  if (typeof v === 'number' && Number.isInteger(v) && v <= 0) fail(at, column, 'expected a positive id');
  return int(at, column, v);
}

/**
 * Dollars as a float -> integer cents. Refuses anything that is not a whole number of
 * cents once float noise (far below a millionth of a cent) is ignored.
 */
export function cents(at: At, column: string, v: Cell | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(at, column, isBlank(v) ? 'blank' : 'expected an amount');
    return 0;
  }
  const c = Math.round(v * 100);
  if (Math.abs(v * 100 - c) > 1e-6) fail(at, column, 'not a whole number of cents');
  return c;
}

export function centsOrNull(at: At, column: string, v: Cell | undefined): number | null {
  return isBlank(v) ? null : cents(at, column, v);
}

/** A real TRUE/FALSE cell. */
export function bool(at: At, column: string, v: Cell | undefined): boolean {
  if (typeof v === 'boolean') return v;
  fail(at, column, isBlank(v) ? 'blank' : 'expected TRUE or FALSE');
  return false;
}

/** Only the exact word grants (RBAC §4): anything else, blank included, is false. */
export const exactly = (word: string, v: Cell | undefined): boolean => typeof v === 'string' && v.trim() === word;

function wallClock(at: At, column: string, v: Cell | undefined): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  return fail(at, column, isBlank(v) ? 'blank' : 'expected a date');
}

/** A calendar date, 'YYYY-MM-DD'. */
export function date(at: At, column: string, v: Cell | undefined): string {
  const d = wallClock(at, column, v);
  return d ? d.toISOString().slice(0, 10) : '';
}

/** A time of day, 'HH:MM:SS'. */
export function time(at: At, column: string, v: Cell | undefined): string {
  const d = wallClock(at, column, v);
  return d ? d.toISOString().slice(11, 19) : '';
}

/** A Toronto wall-clock timestamp -> the real instant. */
export function instant(at: At, column: string, v: Cell | undefined): Date {
  const d = wallClock(at, column, v);
  if (!d) return new Date(0);
  return torontoWallClock(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
}

export function instantOrNull(at: At, column: string, v: Cell | undefined): Date | null {
  return isBlank(v) ? null : instant(at, column, v);
}
