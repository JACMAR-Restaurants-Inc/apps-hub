/**
 * forms: HR's forms, in place of Jotform (owner, 2026-10-09). HR (Bureau with the Forms
 * app) and system admins write them on a screen; a form is shared with roles, optionally
 * narrowed to restaurants, and/or with chosen people from the access directory.
 *
 * - A form's questions live in VERSIONS. Publishing writes a new version; a submission
 *   keeps the version it answered, so editing an open form never rewrites past answers.
 *   The definition is jsonb, checked in code (lib/forms/definition.ts) on every write
 *   and every read.
 * - Who may fill a form (`audience`) is read fresh on every click against the roster
 *   (lib/forms/rules.ts), like a beta's testers: a person who becomes a Gérant sees a form
 *   shared with Gérants, and someone switched off stops seeing it.
 * - Retention (Law 25): a submission's answers to fields marked sensitive are cleared
 *   `sensitiveDays` after the form closes, the whole submission `keepDays` after.
 * - Every change is an event: who, when, what.
 * - No foreign key into rbac or identity: the app stays separable (CLAUDE.md §3). The
 *   restaurant is an id, checked in code against the restaurants list.
 */

import { boolean, index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const formsSchema = pgSchema('forms');

export const formStatusEnum = formsSchema.enum('form_status', ['draft', 'open', 'closed']);

const stamp = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const forms = formsSchema.table('forms', {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  /** The working title, for the lists. The published title is in the version. */
  title: text().notNull(),
  status: formStatusEnum().notNull(),
  /** The draft being edited: a FormDefinition, not yet seen by anyone filling. */
  draft: jsonb().notNull(),
  /** The version people fill now; null until first published. */
  currentVersion: integer(),
  /** Who may fill it: { roles: Role[], stores: string[], people: string[] }. */
  audience: jsonb().notNull(),
  /** Where each submission is emailed (HR's inbox). Null: nobody is emailed. */
  notifyEmail: text(),
  /** One submission per person (Calypso: one registration each), checked under the form's row lock. */
  oncePerPerson: boolean().notNull().default(true),
  sensitiveDays: integer().notNull().default(30),
  keepDays: integer().notNull().default(365),
  createdBy: text().notNull(),
  createdAt: stamp(),
  updatedAt: stamp(),
  closedAt: timestamp({ withTimezone: true }),
}).enableRLS();

export const formVersions = formsSchema.table(
  'versions',
  {
    formId: integer()
      .notNull()
      .references(() => forms.id),
    version: integer().notNull(),
    definition: jsonb().notNull(),
    publishedBy: text().notNull(),
    publishedAt: stamp(),
  },
  (t) => [primaryKey({ columns: [t.formId, t.version] })],
).enableRLS();

export const submissions = formsSchema.table(
  'submissions',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    formId: integer()
      .notNull()
      .references(() => forms.id),
    version: integer().notNull(),
    /** The signed-in address, normalised. */
    email: text().notNull(),
    /** From the access directory at the moment of submitting, never typed. */
    fullName: text(),
    employeeNumber: text(),
    /** One of the person's restaurants; null for an admin who holds none. */
    restaurantId: text(),
    /** { [fieldId]: value }, checked against the version's definition. */
    answers: jsonb().notNull(),
    /** "I agree": the name they typed, recorded with submittedAt. */
    signedName: text(),
    submittedAt: stamp(),
    sensitiveClearedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.formId, t.submittedAt), index().on(t.formId, t.restaurantId)],
).enableRLS();

export const formEvents = formsSchema.table(
  'events',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    formId: integer()
      .notNull()
      .references(() => forms.id),
    actorEmail: text(),
    event: text().notNull(),
    detail: jsonb(),
    at: stamp(),
  },
  (t) => [index().on(t.formId)],
).enableRLS();
