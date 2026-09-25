/**
 * cash: Cash Balancing, ported from the "Cash Balancing — Data" spreadsheet
 * (safe-count-tracker Config.gs HEADERS).
 *
 * - Every amount is INTEGER CENTS, suffixed _cents. See @hub/core money.ts.
 * - Ids are KEPT from the spreadsheet on import (count 507 stays 507), so old PDFs,
 *   emails and Drive links still point at the right count. Identity columns are
 *   "by default" so the import can write them; the import then moves each sequence
 *   past the highest imported id. See scripts/import.
 * - count_date / count_time are set by the SERVER in America/Toronto at submit.
 * - Children reference their count; a count and its children are written in ONE
 *   transaction. The old app could leave a total with no breakdown behind; this
 *   cannot.
 * - Config_Managers is NOT carried over. rbac replaces it, and its login/password
 *   columns are plaintext credentials that must not be copied anywhere.
 * - The pseudo-restaurants ALL and ADMIN were login rows, not restaurants, and are
 *   dropped on import.
 */

import { bigint, boolean, date, index, integer, pgSchema, primaryKey, text, time, timestamp } from 'drizzle-orm/pg-core';
import { restaurants } from './rbac';

export const cash = pgSchema('cash');

export const reportStatusEnum = cash.enum('report_status', ['pending', 'sent', 'failed']);

const stamp = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const cents = () => integer().notNull();
const restaurantRef = () =>
  text()
    .notNull()
    .references(() => restaurants.restaurantId);

/** Per-restaurant settings for this app. The restaurant itself lives in rbac.restaurants. */
export const restaurantSettings = cash.table('restaurant_settings', {
  restaurantId: text()
    .primaryKey()
    .references(() => restaurants.restaurantId),
  /** The variance baseline. Changing it re-bases every future variance, so every change is audited. */
  expectedSafeTotalCents: cents(),
  /** Where this restaurant's count reports go. */
  reportEmail: text(),
}).enableRLS();

export const tills = cash.table(
  'tills',
  {
    restaurantId: restaurantRef(),
    tillNumber: integer().notNull(),
    tillLabel: text().notNull(),
    baseAmountCents: cents(),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.tillNumber] })],
).enableRLS();

export const safeCounts = cash.table(
  'safe_counts',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    restaurantId: restaurantRef(),
    managerName: text().notNull(),
    /** Who filed it, as signed in. Null on counts imported from the spreadsheet, which never recorded it. */
    filedBy: text(),
    countDate: date({ mode: 'string' }).notNull(),
    countTime: time().notNull(),
    comments: text(),
    tillsTotalCents: cents(),
    coinsTotalCents: cents(),
    paperTotalCents: cents(),
    pettyCashTotalCents: cents(),
    grandTotalCents: cents(),
    /** Read from restaurant_settings on the server at submit. Never from the browser. */
    expectedTotalCents: cents(),
    varianceCents: cents(),
    language: text().notNull(),
    pdfUrl: text(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.restaurantId, t.countDate), index().on(t.countDate)],
).enableRLS();

const countRef = () =>
  integer()
    .notNull()
    .references(() => safeCounts.id);

export const countTills = cash.table(
  'count_tills',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    restaurantId: restaurantRef(),
    tillNumber: integer().notNull(),
    tillLabel: text().notNull(),
    baseAmountCents: cents(),
    countedAmountCents: cents(),
    varianceCents: cents(),
    wasShort: boolean().notNull(),
    wasFixed: boolean().notNull(),
    fixAmountFromIntakeCents: cents(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

export const countCoins = cash.table(
  'count_coins',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    denominationCents: cents(),
    rolls: integer().notNull(),
    looseCount: integer().notNull(),
    totalCents: cents(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

export const countPaper = cash.table(
  'count_paper',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    denominationCents: cents(),
    count: integer().notNull(),
    totalCents: cents(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

export const countPettyCash = cash.table(
  'count_petty_cash',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    description: text().notNull(),
    amountCents: cents(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

export const tillFixes = cash.table(
  'till_fixes',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    tillNumber: integer().notNull(),
    shortageAmountCents: cents(),
    intakeDeltaCents: cents(),
    fixedAt: timestamp({ withTimezone: true }),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

/**
 * Photos and PDFs attached to a count. A staged upload has no count yet
 * (safe_count_id null, not the old app's 0) and is owned by who uploaded it, at the
 * restaurant that was authorised at upload time.
 */
export const attachments = cash.table(
  'attachments',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: integer().references(() => safeCounts.id),
    restaurantId: restaurantRef(),
    uploadedBy: text(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    fileSize: integer().notNull(),
    /** Path in Supabase Storage. */
    storagePath: text(),
    /** Where it lived in Drive before the move, kept so nothing is untraceable. */
    legacyDriveFileId: text(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.safeCountId)],
).enableRLS();

/** The report queue: PDF, email, archive. Drained by a scheduled job. */
export const reportJobs = cash.table(
  'report_jobs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    safeCountId: countRef(),
    language: text().notNull(),
    status: reportStatusEnum().notNull(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    sendToAccountant: boolean().notNull(),
    createdAt: stamp(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.status)],
).enableRLS();
