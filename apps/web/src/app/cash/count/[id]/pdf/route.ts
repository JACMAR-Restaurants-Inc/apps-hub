import { AccessDenied, authorize } from '@/lib/access';
import { cashDb } from '@/lib/cash/db';
import { fileStore } from '@/lib/cash/files';
import { CASH_APP } from '@/lib/cash/math';
import { fileResponse, notFound } from '@/lib/cash/serve';
import { countRestaurant } from '@/lib/cash/store';
import { safeCounts } from '@hub/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

/** A count's report PDF, for whoever may view that restaurant's counts. */
export async function GET(_: Request, ctx: RouteContext<'/cash/count/[id]/pdf'>) {
  const { id } = await ctx.params;
  const n = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  const record = Number.isSafeInteger(n) ? await countRestaurant(cashDb(), n) : null;
  if (!record) return notFound();
  try {
    await authorize(CASH_APP, 'count', 'view', record.restaurantId);
  } catch (e) {
    if (e instanceof AccessDenied) return notFound();
    throw e;
  }
  const [row] = await cashDb().select({ pdfUrl: safeCounts.pdfUrl, date: safeCounts.countDate }).from(safeCounts).where(eq(safeCounts.id, n));
  const ref = row?.pdfUrl;
  if (!ref) return notFound();
  if (ref.startsWith('supabase:') || ref.startsWith('drive:')) {
    const file = await fileStore().get(ref);
    return file ? fileResponse(file, `decompte-${n}-${row.date}.pdf`, 'application/pdf') : notFound();
  }
  // Imported: the old app's Drive link.
  if (/^https:\/\/(drive|docs)\.google\.com\//.test(ref)) redirect(ref);
  return notFound();
}
