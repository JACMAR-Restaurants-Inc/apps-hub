/**
 * devops: JM DevOps, the office's project and issue tracker, ported from the
 * "Projects Management" spreadsheet (project-managment BUILD.md: a Config tab of
 * projects, one tab per project, a row per issue).
 *
 * - System admins only (owner, 2026-09-29): the owner and Pierre. No roles.
 * - An issue's key is PREFIX-NUMBER (CHK-066). The prefix never changes, and numbers
 *   are never given out twice: each project holds its next number and every new issue
 *   takes it under a row lock. The old app took max+1 from the sheet, so two people
 *   creating at once could get the same number, and deleting the newest issue let its
 *   number be reused.
 * - Numbers are KEPT on import (CHK-066 stays 66).
 * - An issue CAN be deleted (owner's call, 2026-09-29), an exception to "nothing is
 *   deleted" (CLAUDE.md §3). Its history stays: the events keep the project and number,
 *   and a `deleted` event keeps a full copy of the issue and its comments.
 * - A project can be deleted completely, with its issues, comments and history (owner,
 *   2026-09-29, as the old app did). It used to be archived, never deleted (0010).
 * - Dates are calendar dates (`date`), Toronto's. The old API sent them through UTC and
 *   could show them a day early.
 * - The assignee is an admin's address (normalised). A name from the sheet that matches
 *   no single admin stays as text in assignee_text: never guessed. The old "Requested
 *   by" was dropped (owner, 2026-09-29: "useless"); migration 0009 removed the column.
 * - No foreign key into rbac or identity: the app stays separable (CLAUDE.md §3).
 */

import { sql } from 'drizzle-orm';
import { date, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const devops = pgSchema('devops');

export const issueTypeEnum = devops.enum('issue_type', ['bug', 'feature', 'task']);
export const issueStatusEnum = devops.enum('issue_status', ['new', 'active', 'completed', 'cancelled']);
export const issuePriorityEnum = devops.enum('issue_priority', ['critical', 'high', 'medium', 'low']);

const stamp = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const projects = devops.table(
  'projects',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    name: text().notNull(),
    /** 2 to 6 letters, upper case. Never changes: every issue key is built from it. */
    prefix: text().notNull(),
    githubRepo: text(),
    /** The number the next issue gets. Only ever goes up. */
    nextNumber: integer().notNull().default(1),
    createdAt: stamp(),
    /** Null for projects brought over from the spreadsheet. */
    createdBy: text(),
  },
  (t) => [uniqueIndex('projects_prefix_key').on(t.prefix), uniqueIndex('projects_name_key').on(sql`lower(${t.name})`)],
).enableRLS();

export const issues = devops.table(
  'issues',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    projectId: integer()
      .notNull()
      .references(() => projects.id),
    number: integer().notNull(),
    title: text().notNull(),
    type: issueTypeEnum().notNull(),
    status: issueStatusEnum().notNull(),
    /** Why it was cancelled. Required while the status is cancelled. */
    cancelReason: text(),
    priority: issuePriorityEnum().notNull(),
    assigneeEmail: text(),
    /** The sheet's assignee when it matched no admin, as written. */
    assigneeText: text(),
    description: text().notNull().default(''),
    dueDate: date(),
    /** The day it was created, in Toronto. From the sheet for imported issues. */
    createdOn: date().notNull(),
    /** Null for issues brought over from the spreadsheet: the sheet never said who. */
    createdBy: text(),
    createdAt: stamp(),
    updatedAt: stamp(),
  },
  (t) => [uniqueIndex('issues_project_number_key').on(t.projectId, t.number), index().on(t.status)],
).enableRLS();

export const comments = devops.table(
  'comments',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    issueId: integer()
      .notNull()
      .references(() => issues.id),
    /** Null for the sheet's Notes, carried over as the first comment. */
    authorEmail: text(),
    body: text().notNull(),
    createdAt: stamp(),
  },
  (t) => [index().on(t.issueId)],
).enableRLS();

/**
 * Every change, per project and issue: who, when, the value before and after. It
 * outlives the issue: when one is deleted, its events lose `issue_id` but keep the
 * project and number, and a `deleted` event carries a full copy in `detail`.
 */
export const events = devops.table(
  'events',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    projectId: integer()
      .notNull()
      .references(() => projects.id),
    issueId: integer().references(() => issues.id),
    issueNumber: integer(),
    /** Null for what the import wrote. */
    actorEmail: text(),
    event: text().notNull(),
    before: text(),
    after: text(),
    detail: jsonb(),
    at: stamp(),
  },
  (t) => [index().on(t.issueId), index().on(t.projectId)],
).enableRLS();
