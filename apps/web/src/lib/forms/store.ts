/**
 * Forms' reads and writes. The caller has already checked WHO is asking (lib/forms/rules.ts
 * through the actions); this checks the VALUES.
 *
 * - Every write is one transaction that locks the form's row first. An edit carries what
 *   the page showed and answers 'changed' if the form moved on (CLAUDE.md §3: with two
 *   people on one form, the second save must not silently undo the first).
 * - A submission answers the version the page showed. If HR published since, the answer
 *   is 'changed' and the person sees the new questions; answers are never fitted to a
 *   version they were not written for.
 * - "One per person" is checked under the same row lock, so a double tap files once.
 * - Every change is an event. A submission's answers are not copied into events.
 * - Never a join into rbac or identity (CLAUDE.md §3, separable): who the person is comes
 *   in from the caller, read through the roster's door.
 */

import { formEvents, formVersions, forms, submissions, type Db } from '@hub/db';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { checkAnswers, emptyDefinition, fileAnswers, parseDefinition, type AnswerError, type Answers, type FormDefinition } from './definition';
import { linkFiles, unlinkableFiles } from './files';
import { NOBODY, parseAudience, type Audience } from './rules';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Conn = Db | Tx;

export type Outcome = 'done' | 'unchanged' | 'changed' | 'invalid' | 'not_found';
export type FormStatus = 'draft' | 'open' | 'closed';

export interface FormRow {
  id: number;
  title: string;
  status: FormStatus;
  draft: unknown;
  currentVersion: number | null;
  audience: Audience;
  notifyEmail: string | null;
  oncePerPerson: boolean;
  sensitiveDays: number;
  keepDays: number;
  updatedAt: Date;
  closedAt: Date | null;
}

const MAX_TITLE = 200;
const toRow = (r: typeof forms.$inferSelect): FormRow => ({
  id: r.id,
  title: r.title,
  status: r.status,
  draft: r.draft,
  currentVersion: r.currentVersion,
  audience: parseAudience(r.audience),
  notifyEmail: r.notifyEmail,
  oncePerPerson: r.oncePerPerson,
  sensitiveDays: r.sensitiveDays,
  keepDays: r.keepDays,
  updatedAt: r.updatedAt,
  closedAt: r.closedAt,
});

const validId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0;

async function locked(tx: Conn, id: number) {
  const [r] = await tx.select().from(forms).where(eq(forms.id, id)).for('update');
  return r ? toRow(r) : null;
}

const event = (tx: Conn, formId: number, actor: string | null, name: string, detail?: unknown) =>
  tx.insert(formEvents).values({ formId, actorEmail: actor, event: name, detail: detail ?? null });

export async function getForm(db: Conn, id: unknown): Promise<FormRow | null> {
  if (!validId(id)) return null;
  const [r] = await db.select().from(forms).where(eq(forms.id, id));
  return r ? toRow(r) : null;
}

/** Every form, newest first, with how many submissions each has: for HR's list. */
export async function listForms(db: Conn) {
  const [rows, counts] = await Promise.all([
    db.select().from(forms).orderBy(desc(forms.createdAt), desc(forms.id)),
    db.select({ formId: submissions.formId, n: count() }).from(submissions).groupBy(submissions.formId),
  ]);
  const n = new Map(counts.map((c) => [c.formId, Number(c.n)]));
  return rows.map((r) => ({ ...toRow(r), submissions: n.get(r.id) ?? 0 }));
}

/** The open forms with their published definition, for deciding who sees which. */
export async function openForms(db: Conn) {
  const rows = await db
    .select({ form: forms, definition: formVersions.definition })
    .from(forms)
    .innerJoin(formVersions, and(eq(formVersions.formId, forms.id), eq(formVersions.version, forms.currentVersion)))
    .where(eq(forms.status, 'open'))
    .orderBy(asc(forms.title), asc(forms.id));
  const out = [];
  for (const r of rows) {
    const parsed = parseDefinition(r.definition);
    if (parsed.ok) out.push({ ...toRow(r.form), definition: parsed.definition });
  }
  return out;
}

/** A form's published version, checked; null if it has none or it no longer reads. */
export async function publishedVersion(db: Conn, formId: number, version: number): Promise<FormDefinition | null> {
  const [v] = await db.select({ definition: formVersions.definition }).from(formVersions).where(and(eq(formVersions.formId, formId), eq(formVersions.version, version)));
  if (!v) return null;
  const parsed = parseDefinition(v.definition);
  return parsed.ok ? parsed.definition : null;
}

export async function createForm(db: Conn, actor: string, title: unknown): Promise<{ outcome: Outcome; id?: number }> {
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t || t.length > MAX_TITLE) return { outcome: 'invalid' };
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(forms)
      .values({ title: t, status: 'draft', draft: emptyDefinition(t), audience: NOBODY, createdBy: actor })
      .returning({ id: forms.id });
    await event(tx, r.id, actor, 'created', { title: t });
    return { outcome: 'done', id: r.id };
  });
}

/**
 * Saves the draft: the questions HR is writing. Nobody filling sees it until published.
 * `shownAt` is the form's updatedAt the page showed (ISO): anything newer is 'changed'.
 */
export async function saveDraft(db: Conn, actor: string, id: unknown, shownAt: unknown, raw: unknown): Promise<{ outcome: Outcome; errors?: string[] }> {
  if (!validId(id)) return { outcome: 'not_found' };
  const parsed = parseDefinition(raw);
  if (!parsed.ok) return { outcome: 'invalid', errors: parsed.errors };
  return db.transaction(async (tx) => {
    const form = await locked(tx, id);
    if (!form) return { outcome: 'not_found' };
    if (form.updatedAt.toISOString() !== shownAt) return { outcome: 'changed' };
    if (JSON.stringify(form.draft) === JSON.stringify(parsed.definition)) return { outcome: 'unchanged' };
    await tx.update(forms).set({ draft: parsed.definition, title: parsed.definition.title, updatedAt: sql`now()` }).where(eq(forms.id, id));
    await event(tx, id, actor, 'draft_saved');
    return { outcome: 'done' };
  });
}

/**
 * Publishes the draft as the next version, which everyone filling sees from now on; a
 * draft form opens. Refused if the draft does not read, has no question, or is what is
 * already published.
 */
export async function publish(db: Conn, actor: string, id: unknown, shownAt: unknown): Promise<{ outcome: Outcome; version?: number }> {
  if (!validId(id)) return { outcome: 'not_found' };
  return db.transaction(async (tx) => {
    const form = await locked(tx, id);
    if (!form) return { outcome: 'not_found' };
    if (form.updatedAt.toISOString() !== shownAt) return { outcome: 'changed' };
    const parsed = parseDefinition(form.draft);
    if (!parsed.ok || !parsed.definition.fields.some((f) => f.type !== 'heading')) return { outcome: 'invalid' };
    if (form.currentVersion !== null) {
      const live = await publishedVersion(tx, id, form.currentVersion);
      if (JSON.stringify(live) === JSON.stringify(parsed.definition)) return { outcome: 'unchanged' };
    }
    const version = (form.currentVersion ?? 0) + 1;
    await tx.insert(formVersions).values({ formId: id, version, definition: parsed.definition, publishedBy: actor });
    await tx
      .update(forms)
      .set({ currentVersion: version, status: form.status === 'draft' ? 'open' : form.status, updatedAt: sql`now()` })
      .where(eq(forms.id, id));
    await event(tx, id, actor, 'published', { version });
    return { outcome: 'done', version };
  });
}

/**
 * Who may fill it. Returns the people newly reached by name or role, for the caller to
 * notify; the caller decides who that is from the roster (the store does not read rbac).
 */
export async function share(db: Conn, actor: string, id: unknown, shown: unknown, next: unknown): Promise<{ outcome: Outcome; before?: Audience; after?: Audience }> {
  if (!validId(id)) return { outcome: 'not_found' };
  const after = parseAudience(next);
  return db.transaction(async (tx) => {
    const form = await locked(tx, id);
    if (!form) return { outcome: 'not_found' };
    if (JSON.stringify(form.audience) !== JSON.stringify(parseAudience(shown))) return { outcome: 'changed' };
    if (JSON.stringify(form.audience) === JSON.stringify(after)) return { outcome: 'unchanged' };
    await tx.update(forms).set({ audience: after, updatedAt: sql`now()` }).where(eq(forms.id, id));
    await event(tx, id, actor, 'shared', { before: form.audience, after });
    return { outcome: 'done', before: form.audience, after };
  });
}

/** Open or close. A form never published cannot open: there is nothing to fill. */
export async function setStatus(db: Conn, actor: string, id: unknown, status: unknown, shownAt: unknown): Promise<Outcome> {
  if (!validId(id)) return 'not_found';
  if (status !== 'open' && status !== 'closed') return 'invalid';
  return db.transaction(async (tx) => {
    const form = await locked(tx, id);
    if (!form) return 'not_found';
    if (form.updatedAt.toISOString() !== shownAt) return 'changed';
    if (form.status === status) return 'unchanged';
    if (status === 'open' && form.currentVersion === null) return 'invalid';
    await tx
      .update(forms)
      .set({ status, closedAt: status === 'closed' ? sql`now()` : null, updatedAt: sql`now()` })
      .where(eq(forms.id, id));
    await event(tx, id, actor, status === 'open' ? 'opened' : 'closed');
    return 'done';
  });
}

export interface Person {
  email: string;
  fullName: string | null;
  employeeNumber: string | null;
}

export type SubmitResult =
  | { outcome: 'done'; id: number }
  | { outcome: 'invalid'; errors: Record<string, AnswerError> }
  | { outcome: 'not_found' | 'not_open' | 'changed' | 'already' | 'denied' };

/**
 * Files one submission. `allowed` is the caller's decision for THIS form, made from the
 * roster (fillDecision) and re-made here against the locked row's audience and status,
 * so a form closed or unshared a moment ago refuses.
 */
export async function submit(
  db: Conn,
  person: Person,
  formId: unknown,
  shownVersion: unknown,
  rawAnswers: unknown,
  signedName: unknown,
  decide: (status: string, audience: Audience) => { restaurantId: string | null } | null,
): Promise<SubmitResult> {
  if (!validId(formId)) return { outcome: 'not_found' };
  return db.transaction(async (tx) => {
    const form = await locked(tx, formId);
    if (!form) return { outcome: 'not_found' };
    if (form.status !== 'open' || form.currentVersion === null) return { outcome: 'not_open' };
    const where = decide(form.status, form.audience);
    if (!where) return { outcome: 'denied' };
    if (shownVersion !== form.currentVersion) return { outcome: 'changed' };
    const def = await publishedVersion(tx, formId, form.currentVersion);
    if (!def) return { outcome: 'not_open' };
    const checked = checkAnswers(def, rawAnswers, signedName);
    if (!checked.ok) return { outcome: 'invalid', errors: checked.errors };
    // The files named must be the person's own, for that question, still staged; checked
    // (and their rows locked) before anything is written, linked after.
    const files = fileAnswers(def, checked.answers);
    const badFiles = await unlinkableFiles(tx, formId, person.email, files);
    if (badFiles.length) return { outcome: 'invalid', errors: Object.fromEntries(badFiles.map((f) => [f, 'invalid' as const])) };
    if (form.oncePerPerson) {
      const [prior] = await tx.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.formId, formId), eq(submissions.email, person.email))).limit(1);
      if (prior) return { outcome: 'already' };
    }
    const [r] = await tx
      .insert(submissions)
      .values({
        formId,
        version: form.currentVersion,
        email: person.email,
        fullName: person.fullName,
        employeeNumber: person.employeeNumber,
        restaurantId: where.restaurantId,
        answers: checked.answers,
        signedName: checked.signedName,
      })
      .returning({ id: submissions.id });
    await linkFiles(tx, r.id, files);
    await event(tx, formId, person.email, 'submitted', { submission: r.id, restaurantId: where.restaurantId });
    return { outcome: 'done', id: r.id };
  });
}

/** When this person last submitted each form, for "already sent" on their list. */
export async function mySubmissions(db: Conn, email: string): Promise<Map<number, Date>> {
  const rows = await db
    .select({ formId: submissions.formId, at: sql<Date>`max(${submissions.submittedAt})` })
    .from(submissions)
    .where(eq(submissions.email, email))
    .groupBy(submissions.formId);
  return new Map(rows.map((r) => [r.formId, new Date(r.at)]));
}

export interface SubmissionRow {
  id: number;
  version: number;
  email: string;
  fullName: string | null;
  employeeNumber: string | null;
  restaurantId: string | null;
  answers: Answers;
  signedName: string | null;
  submittedAt: Date;
  sensitiveClearedAt: Date | null;
}

/** A form's submissions the reader may see: 'all', or only those of these restaurants. Oldest first. */
export async function listSubmissions(db: Conn, formId: number, scope: 'all' | string[]): Promise<SubmissionRow[]> {
  if (scope !== 'all' && !scope.length) return [];
  const rows = await db
    .select()
    .from(submissions)
    .where(scope === 'all' ? eq(submissions.formId, formId) : and(eq(submissions.formId, formId), inArray(submissions.restaurantId, scope)))
    .orderBy(asc(submissions.submittedAt), asc(submissions.id));
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    email: r.email,
    fullName: r.fullName,
    employeeNumber: r.employeeNumber,
    restaurantId: r.restaurantId,
    answers: (r.answers ?? {}) as Answers,
    signedName: r.signedName,
    submittedAt: r.submittedAt,
    sensitiveClearedAt: r.sensitiveClearedAt,
  }));
}

/** Every version of a form, for reading submissions made to older ones. */
export async function allVersions(db: Conn, formId: number): Promise<Map<number, FormDefinition>> {
  const rows = await db.select().from(formVersions).where(eq(formVersions.formId, formId));
  const out = new Map<number, FormDefinition>();
  for (const r of rows) {
    const parsed = parseDefinition(r.definition);
    if (parsed.ok) out.set(r.version, parsed.definition);
  }
  return out;
}

export interface Settings {
  notifyEmail: string | null;
  oncePerPerson: boolean;
  sensitiveDays: number;
  keepDays: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings as sent, checked: a real address or none, retention in whole days, sensitive first. */
export function parseSettings(raw: unknown): Settings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const email = typeof r.notifyEmail === 'string' ? r.notifyEmail.trim().toLowerCase() : '';
  if (email && (email.length > 254 || !EMAIL.test(email))) return null;
  const days = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3650 ? v : null);
  const sensitiveDays = days(r.sensitiveDays);
  const keepDays = days(r.keepDays);
  if (sensitiveDays === null || keepDays === null || sensitiveDays > keepDays || typeof r.oncePerPerson !== 'boolean') return null;
  return { notifyEmail: email || null, oncePerPerson: r.oncePerPerson, sensitiveDays, keepDays };
}

const settingsOf = (f: FormRow): Settings => ({ notifyEmail: f.notifyEmail, oncePerPerson: f.oncePerPerson, sensitiveDays: f.sensitiveDays, keepDays: f.keepDays });

/** Where answers are emailed, one per person, and how long answers are kept. */
export async function updateSettings(db: Conn, actor: string, id: unknown, shown: unknown, next: unknown): Promise<Outcome> {
  if (!validId(id)) return 'not_found';
  const after = parseSettings(next);
  if (!after) return 'invalid';
  return db.transaction(async (tx) => {
    const form = await locked(tx, id);
    if (!form) return 'not_found';
    const before = settingsOf(form);
    if (JSON.stringify(before) !== JSON.stringify(parseSettings(shown))) return 'changed';
    if (JSON.stringify(before) === JSON.stringify(after)) return 'unchanged';
    await tx.update(forms).set({ ...after, updatedAt: sql`now()` }).where(eq(forms.id, id));
    await event(tx, id, actor, 'settings', { before, after });
    return 'done';
  });
}

/**
 * A new draft from an existing form: its questions (the draft being written, which is
 * the published one or newer) and its settings, shared with nobody, with no answers.
 * Last year's Calypso becomes this year's (owner, 2026-10-09: small changes each year).
 */
export async function duplicateForm(db: Conn, actor: string, id: unknown, title: unknown): Promise<{ outcome: Outcome; id?: number }> {
  if (!validId(id)) return { outcome: 'not_found' };
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t || t.length > MAX_TITLE) return { outcome: 'invalid' };
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(forms).where(eq(forms.id, id));
    if (!source) return { outcome: 'not_found' };
    const parsed = parseDefinition(source.draft);
    const draft = parsed.ok ? { ...parsed.definition, title: t } : emptyDefinition(t);
    const [r] = await tx
      .insert(forms)
      .values({ title: t, status: 'draft', draft, audience: NOBODY, notifyEmail: source.notifyEmail, oncePerPerson: source.oncePerPerson, sensitiveDays: source.sensitiveDays, keepDays: source.keepDays, createdBy: actor })
      .returning({ id: forms.id });
    await event(tx, r.id, actor, 'created', { title: t, from: id });
    return { outcome: 'done', id: r.id };
  });
}
