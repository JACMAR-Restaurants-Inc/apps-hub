import 'server-only';
import type { StoredFile } from './files';

/**
 * A stored file as a response. Private and not cached; shown in the browser (inline)
 * with its own name; and nosniff, so a file can only ever be the type it was stored as.
 */
export function fileResponse(file: StoredFile, name: string, contentType: string): Response {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(file.bytes as BodyInit, {
    headers: {
      'content-type': contentType,
      'content-disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export const notFound = () => new Response('Introuvable / Not found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
