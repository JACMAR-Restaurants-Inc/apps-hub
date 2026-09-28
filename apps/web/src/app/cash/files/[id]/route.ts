import { AccessDenied, authorize } from '@/lib/access';
import { attachmentById } from '@/lib/cash/attachments';
import { cashDb } from '@/lib/cash/db';
import { fileStore } from '@/lib/cash/files';
import { CASH_APP } from '@/lib/cash/math';
import { fileResponse, notFound } from '@/lib/cash/serve';
import { redirect } from 'next/navigation';

/**
 * One attachment. A linked one is shown to whoever may view counts at its COUNT's
 * restaurant; a staged one only to who uploaded it. Anything else is "not found",
 * exactly like a file that does not exist.
 */
export async function GET(_: Request, ctx: RouteContext<'/cash/files/[id]'>) {
  const { id } = await ctx.params;
  const row = /^\d{1,9}$/.test(id) ? await attachmentById(cashDb(), Number(id)) : null;
  if (!row) return notFound();
  try {
    if (row.safeCountId !== null) await authorize(CASH_APP, 'count', 'view', row.countRestaurantId);
    else {
      const { email } = await authorize(CASH_APP, 'attachment', 'upload', row.restaurantId);
      if (email !== row.uploadedBy) return notFound();
    }
  } catch (e) {
    if (e instanceof AccessDenied) return notFound();
    throw e;
  }
  if (row.storagePath) {
    const file = await fileStore().get(row.storagePath);
    return file ? fileResponse(file, row.fileName, row.mimeType) : notFound();
  }
  // Imported from the spreadsheet: still in Drive, where the old app shared it by link.
  if (row.legacyDriveFileId && /^[\w-]{10,}$/.test(row.legacyDriveFileId)) redirect(`https://drive.google.com/file/d/${row.legacyDriveFileId}/view`);
  return notFound();
}
