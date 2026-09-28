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
 * Supabase's Storage REST API, no SDK, with the secret key, on the server only.
 */

export interface StoredFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface FileStore {
  /** Saves the file and returns its ref. Replaces a file already at that path. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(ref: string): Promise<StoredFile | null>;
  remove(ref: string): Promise<void>;
}

const BUCKET = 'cash';

function supabaseStore(url: string, key: string): FileStore {
  const headers = { authorization: `Bearer ${key}`, apikey: key };
  const objectUrl = (path: string) => `${url}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const pathOf = (ref: string) => (ref.startsWith('supabase:') ? ref.slice('supabase:'.length) : null);
  return {
    async put(path, bytes, contentType) {
      const res = await fetch(objectUrl(path), {
        method: 'POST',
        headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'private, max-age=0' },
        body: bytes as BodyInit,
      });
      if (!res.ok) throw new Error(`storage_put_${res.status}`);
      return `supabase:${path}`;
    },
    async get(ref) {
      const path = pathOf(ref);
      if (!path) return null;
      const res = await fetch(objectUrl(path), { headers, cache: 'no-store' });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`storage_get_${res.status}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
    },
    async remove(ref) {
      const path = pathOf(ref);
      if (!path) return;
      const res = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!res.ok && res.status !== 404) throw new Error(`storage_remove_${res.status}`);
    },
  };
}

export function fileStore(): FileStore {
  const which = process.env.CASH_FILE_STORE ?? 'supabase';
  if (which === 'drive') throw new Error('The Drive file store is not built yet: Drive access is still waiting on the Workspace admin');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('File storage is not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return supabaseStore(url.replace(/\/+$/, ''), key);
}

/** What a stored file really is, from its first bytes, whatever the browser said. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, s: string) => [...s].every((c, i) => b(from + i) === c.charCodeAt(0));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, '%PDF-')) return 'application/pdf';
  return null;
}
