import 'server-only';

/**
 * Private file storage, shared by the apps that take files (Cash Balancing's attachments
 * and report PDFs, Forms' uploads; moved here from lib/cash/files.ts 2026-10-13). Each app
 * has its own PRIVATE Supabase Storage bucket, so an app's files move with it (CLAUDE.md
 * §3, separable). Files are never public: each app serves them through its own route,
 * after deciding who may see them.
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

function supabaseStore(url: string, key: string, bucket: string): FileStore {
  const headers = { authorization: `Bearer ${key}`, apikey: key };
  const objectUrl = (path: string) => `${url}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const pathOf = (ref: string) => (ref.startsWith('supabase:') ? ref.slice('supabase:'.length) : null);
  return {
    async put(path, bytes, contentType) {
      const res = await fetch(objectUrl(path), {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': contentType,
          'x-upsert': 'true',
          'cache-control': 'private, max-age=0',
        },
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
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
    async remove(ref) {
      const path = pathOf(ref);
      if (!path) return;
      const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!res.ok && res.status !== 404) throw new Error(`storage_remove_${res.status}`);
    },
  };
}

/** The private Supabase bucket `bucket`. Throws when storage is not configured. */
export function supabaseBucket(bucket: string): FileStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('File storage is not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return supabaseStore(url.replace(/\/+$/, ''), key, bucket);
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
  // HEIF, an iPhone's own photo format: an ISO box "ftyp" with a HEIF brand.
  if (ascii(4, 'ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].some((brand) => ascii(8, brand))) return 'image/heic';
  return null;
}

/** A file name safe to store and to show: no path, no control characters, 100 characters at most. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (clean || 'fichier').slice(0, 100);
}

/**
 * A stored file as a response. Private and not cached; shown in the browser (inline,
 * or downloaded when the browser cannot show it) with its own name; and nosniff, so a file can only ever be the type it was stored as,
 * which upload read from its bytes (images and PDFs only, never HTML or SVG).
 */
export function fileResponse(file: StoredFile, name: string, contentType: string, download = false): Response {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(file.bytes as BodyInit, {
    headers: {
      'content-type': contentType,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      // No Content-Security-Policy sandbox: it stops Chrome's PDF viewer drawing the
      // pages (seen 2026-09-28, every page blank). The type is fixed and checked from
      // the bytes at upload, and nosniff keeps the browser to it.
      'x-content-type-options': 'nosniff',
    },
  });
}

export const notFound = () =>
  new Response('Introuvable / Not found', {
    status: 404,
    headers: { 'cache-control': 'private, no-store' },
  });
