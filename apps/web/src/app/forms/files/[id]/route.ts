import { formsDb } from '@/lib/forms/db';
import { fileById } from '@/lib/forms/files';
import { mayRead, responsesScope } from '@/lib/forms/rules';
import { fileResponse, notFound, supabaseBucket } from '@/lib/storage';
import { getRoster, getSignedInEmail } from '@/lib/viewer';

/**
 * One file sent with a form. A file already sent is shown to whoever may read that
 * submission's answers (its restaurant decides, as on the answers page); a staged one
 * only to who uploaded it. Anything else is "not found", exactly like a file that does
 * not exist. HEIC (an iPhone photo) is downloaded: most browsers cannot show it.
 */
export async function GET(_: Request, ctx: RouteContext<'/forms/files/[id]'>) {
  const { id } = await ctx.params;
  const who = await getSignedInEmail();
  if (!who) return notFound();
  const row = /^\d{1,9}$/.test(id) ? await fileById(formsDb(), Number(id)) : null;
  if (!row?.storagePath) return notFound();
  if (row.submissionId === null) {
    if (row.uploadedBy !== who.email) return notFound();
  } else if (!mayRead(responsesScope(await getRoster(), who.email), row.restaurantId)) return notFound();
  const file = await supabaseBucket('forms').get(row.storagePath);
  return file ? fileResponse(file, row.fileName, row.mimeType, row.mimeType === 'image/heic') : notFound();
}
