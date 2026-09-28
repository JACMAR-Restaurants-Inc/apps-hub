import 'server-only';
import type { StoredFile } from './files';

/**
 * A stored file as a response. Private and not cached; shown in the browser (inline)
 * with its own name; and nosniff, so a file can only ever be the type it was stored as,
 * which upload read from its bytes (images and PDFs only, never HTML or SVG).
 */
export function fileResponse(file: StoredFile, name: string, contentType: string): Response {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(file.bytes as BodyInit, {
    headers: {
      'content-type': contentType,
      'content-disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      // No Content-Security-Policy sandbox: it stops Chrome's PDF viewer drawing the
      // pages (seen 2026-09-28, every page blank). The type is fixed and checked from
      // the bytes at upload, and nosniff keeps the browser to it.
      'x-content-type-options': 'nosniff',
    },
  });
}

export const notFound = () => new Response('Introuvable / Not found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
