/**
 * Files sent with a form (owner, 2026-10-13): photos and PDFs on a file question.
 *
 * A file is uploaded while the person fills the form, before the submission exists, so it
 * is STAGED first: owned by who uploaded it, for one form's one question. submit() links
 * the staged files the answers name (linkFiles, inside its transaction) and refuses any
 * that are not that person's, for that question, still staged. A staged file may be
 * removed by its uploader only. Staged files nobody sent are removed after a day.
 *
 * The bytes live in the private `forms` bucket (lib/storage.ts), separate from Cash
 * Balancing's, so the app stays separable (CLAUDE.md §3).
 */

import { formFiles, submissions } from '@hub/db';
import { and, count, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import type { Conn } from './store';

/**
 * 5 files a question, as many questions as the form has. 4 MB each: Vercel refuses a
 * request over 4.5 MB (owner asked for 10 MB, 2026-10-13; photos are shrunk in the browser
 * first, so this binds PDFs). HEIC is an iPhone's own photo format; browsers other than
 * Safari cannot show it, so it is served as a download.
 */
export const MAX_FILES = 5;
export const MAX_BYTES = 4 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
/** A generous ceiling on one person's staged files in a day, well above a form's needs. */
export const MAX_STAGED_PER_DAY = 40;

export interface FileRow {
  id: number;
  formId: number;
  fieldId: string;
  submissionId: number | null;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string | null;
  /** The submission's restaurant, which decides who may read a linked file. */
  restaurantId: string | null;
}

export async function stagedCount(conn: Conn, email: string, since: Date): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(formFiles)
    .where(and(eq(formFiles.uploadedBy, email), isNull(formFiles.submissionId), gte(formFiles.createdAt, since)));
  return row?.n ?? 0;
}

export async function stageFile(
  conn: Conn,
  f: {
    formId: number;
    fieldId: string;
    email: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<number> {
  const [r] = await conn
    .insert(formFiles)
    .values({
      formId: f.formId,
      fieldId: f.fieldId,
      uploadedBy: f.email,
      fileName: f.fileName,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
    })
    .returning({ id: formFiles.id });
  return r.id;
}

export async function setFilePath(conn: Conn, id: number, ref: string): Promise<void> {
  await conn.update(formFiles).set({ storagePath: ref }).where(eq(formFiles.id, id));
}

export async function fileById(conn: Conn, id: number): Promise<FileRow | null> {
  const [r] = await conn
    .select({
      id: formFiles.id,
      formId: formFiles.formId,
      fieldId: formFiles.fieldId,
      submissionId: formFiles.submissionId,
      uploadedBy: formFiles.uploadedBy,
      fileName: formFiles.fileName,
      mimeType: formFiles.mimeType,
      fileSize: formFiles.fileSize,
      storagePath: formFiles.storagePath,
      restaurantId: submissions.restaurantId,
    })
    .from(formFiles)
    .leftJoin(submissions, eq(submissions.id, formFiles.submissionId))
    .where(eq(formFiles.id, id));
  return r ?? null;
}

/** Removes one of MY staged files' row; returns its ref so the caller removes the bytes. */
export async function unstageFile(conn: Conn, id: number, email: string): Promise<{ ok: true; ref: string | null } | { ok: false }> {
  const [r] = await conn
    .delete(formFiles)
    .where(and(eq(formFiles.id, id), isNull(formFiles.submissionId), eq(formFiles.uploadedBy, email)))
    .returning({ ref: formFiles.storagePath });
  return r ? { ok: true, ref: r.ref } : { ok: false };
}

/**
 * Inside submit()'s transaction, before anything is written: the questions whose files
 * are not all stored, still-staged files of this person, for this form and that
 * question. Locks the rows, so the link that follows sees them unchanged.
 */
export async function unlinkableFiles(tx: Conn, formId: number, email: string, wanted: { fieldId: string; ids: number[] }[]): Promise<string[]> {
  const ids = wanted.flatMap((w) => w.ids);
  if (!ids.length) return [];
  const rows = await tx
    .select({
      id: formFiles.id,
      formId: formFiles.formId,
      fieldId: formFiles.fieldId,
      submissionId: formFiles.submissionId,
      uploadedBy: formFiles.uploadedBy,
      storagePath: formFiles.storagePath,
    })
    .from(formFiles)
    .where(inArray(formFiles.id, ids))
    .for('update');
  const byId = new Map(rows.map((r) => [r.id, r]));
  return wanted
    .filter((w) =>
      w.ids.some((id) => {
        const r = byId.get(id);
        return !r || r.formId !== formId || r.fieldId !== w.fieldId || r.submissionId !== null || r.uploadedBy !== email || !r.storagePath;
      }),
    )
    .map((w) => w.fieldId);
}

/** Links checked files to their submission (after unlinkableFiles found none at fault). */
export async function linkFiles(tx: Conn, submissionId: number, wanted: { fieldId: string; ids: number[] }[]): Promise<void> {
  const ids = wanted.flatMap((w) => w.ids);
  if (ids.length)
    await tx
      .update(formFiles)
      .set({ submissionId })
      .where(and(inArray(formFiles.id, ids), isNull(formFiles.submissionId)));
}

/** The files linked to these submissions, by id, for the answers page. */
export async function filesOf(conn: Conn, submissionIds: number[]): Promise<Map<number, { fileName: string; mimeType: string }>> {
  if (!submissionIds.length) return new Map();
  const rows = await conn
    .select({
      id: formFiles.id,
      fileName: formFiles.fileName,
      mimeType: formFiles.mimeType,
    })
    .from(formFiles)
    .where(inArray(formFiles.submissionId, submissionIds));
  return new Map(rows.map((r) => [r.id, { fileName: r.fileName, mimeType: r.mimeType }]));
}

/** Staged files older than `before`, oldest first, for the sweep. */
export async function abandonedFiles(conn: Conn, before: Date, limit = 50): Promise<{ id: number; uploadedBy: string; storagePath: string | null }[]> {
  return conn
    .select({
      id: formFiles.id,
      uploadedBy: formFiles.uploadedBy,
      storagePath: formFiles.storagePath,
    })
    .from(formFiles)
    .where(and(isNull(formFiles.submissionId), lt(formFiles.createdAt, before)))
    .orderBy(formFiles.createdAt)
    .limit(limit);
}
