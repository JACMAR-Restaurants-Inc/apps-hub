/**
 * Attachments on a count (Api.gs apiUploadAttachment / apiDeleteAttachment): photos
 * and PDFs added on New Count. An upload is STAGED (no count yet) and owned by who
 * uploaded it, at the restaurant authorised at upload time; submitting the count
 * links it (saveCount). A staged upload may be removed by its uploader only
 * (safe-count §8: one manager could once delete another's by naming their own store).
 * Staged uploads nobody submitted are removed after a day (the report job's sweep).
 */

import { attachments, safeCounts } from '@hub/db';
import { and, count, eq, gte, isNull, lt } from 'drizzle-orm';
import type { Conn } from './store';

/** The old app's limits (Config.gs): 5 files a count, 4 MB each, images and PDFs. */
export const MAX_FILES = 5;
export const MAX_BYTES = 4 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'] as const;

export { cleanFileName } from '../storage';

export async function stagedCount(conn: Conn, email: string, restaurantId: string, since: Date): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, email), eq(attachments.restaurantId, restaurantId), isNull(attachments.safeCountId), gte(attachments.createdAt, since)));
  return Number(row?.n ?? 0);
}

export async function stageAttachment(conn: Conn, a: { restaurantId: string; email: string; fileName: string; mimeType: string; fileSize: number }): Promise<number> {
  const [row] = await conn
    .insert(attachments)
    .values({ restaurantId: a.restaurantId, uploadedBy: a.email, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize })
    .returning({ id: attachments.id });
  return row!.id;
}

export async function setStoragePath(conn: Conn, id: number, ref: string): Promise<void> {
  await conn.update(attachments).set({ storagePath: ref }).where(eq(attachments.id, id));
}

export async function attachmentById(conn: Conn, id: number) {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await conn
    .select({
      id: attachments.id,
      safeCountId: attachments.safeCountId,
      restaurantId: attachments.restaurantId,
      uploadedBy: attachments.uploadedBy,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      fileSize: attachments.fileSize,
      storagePath: attachments.storagePath,
      legacyDriveFileId: attachments.legacyDriveFileId,
      // A linked file is judged by its COUNT's restaurant, the record that matters.
      countRestaurantId: safeCounts.restaurantId,
    })
    .from(attachments)
    .leftJoin(safeCounts, eq(safeCounts.id, attachments.safeCountId))
    .where(eq(attachments.id, id));
  return row ?? null;
}

/**
 * Removes a staged upload's row, if it is still staged and still this person's.
 * The one delete in Cash Balancing: a staged upload is part of an unsent draft, not
 * history. Returns the storage ref to remove, or why not.
 */
export async function unstage(conn: Conn, id: number, email: string): Promise<{ ok: true; ref: string | null } | { ok: false; error: 'not_found' | 'already_linked' | 'not_yours' }> {
  const row = await attachmentById(conn, id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.safeCountId !== null) return { ok: false, error: 'already_linked' };
  if (row.uploadedBy !== email) return { ok: false, error: 'not_yours' };
  const gone = await conn
    .delete(attachments)
    .where(and(eq(attachments.id, id), isNull(attachments.safeCountId), eq(attachments.uploadedBy, email)))
    .returning({ ref: attachments.storagePath });
  if (!gone.length) return { ok: false, error: 'already_linked' };
  return { ok: true, ref: gone[0]!.ref };
}

/** Staged uploads older than `before`, for the sweep. */
export async function abandonedUploads(conn: Conn, before: Date) {
  return conn
    .select({ id: attachments.id, uploadedBy: attachments.uploadedBy, storagePath: attachments.storagePath })
    .from(attachments)
    .where(and(isNull(attachments.safeCountId), lt(attachments.createdAt, before)))
    .limit(200);
}
