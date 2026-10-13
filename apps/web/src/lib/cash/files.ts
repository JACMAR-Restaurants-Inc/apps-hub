import 'server-only';

/**
 * Where Cash Balancing keeps files: the attachments people add to a count, and each
 * count's report PDF. ONE small interface, so where the files live is a setting:
 *
 *   CASH_FILE_STORE=supabase  (default) a PRIVATE Supabase Storage bucket, `cash`
 *   CASH_FILE_STORE=drive     Google Drive, the old app's folders, once the Workspace
 *                             grants Drive access (CLAUDE.md §1); not built yet
 *
 * Owner's call, 2026-09-28: Drive is where the old app kept them and where they will
 * go, but until the permission exists Supabase stands in, so the whole flow can be
 * used end to end. A stored file is named by a REF saved in the database,
 * "supabase:<path>" or "drive:<file id>", so files from either store keep working
 * after a switch.
 *
 * Files are never public. They are served through the app, which authorises against
 * the count's restaurant first (/cash/files/[id], /cash/count/[id]/pdf). The old app
 * shared every PDF and photo as "anyone with the link".
 *
 * The store itself is shared with Forms (lib/storage.ts).
 */

import { supabaseBucket, type FileStore } from '../storage';

export { sniffType, type FileStore, type StoredFile } from '../storage';

export function fileStore(): FileStore {
  const which = process.env.CASH_FILE_STORE ?? 'supabase';
  if (which === 'drive') throw new Error('The Drive file store is not built yet: Drive access is still waiting on the Workspace admin');
  return supabaseBucket('cash');
}
