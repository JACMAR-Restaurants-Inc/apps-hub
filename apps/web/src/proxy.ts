import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, newNonce } from './lib/security-headers';

/**
 * The nonce-based Content-Security-Policy (lib/security-headers.ts), made fresh for
 * every page request: set on the REQUEST, where Next reads the nonce while rendering and
 * puts it on its scripts, and on the response, where the browser enforces it. The steps
 * are Next's own (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 */
export function proxy(request: NextRequest) {
  const policy = contentSecurityPolicy(process.env.NODE_ENV === 'development', newNonce());
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Not: API routes (auth, the cron), Next's built files, the brand images, the web
      // manifest, and the three private file addresses, which must NOT get a policy
      // (it blanked Chrome's PDF viewer). Nor prefetches: not documents.
      source: '/((?!api/|_next/static|_next/image|favicon.ico|brand/|manifest.webmanifest|cash/files/|cash/count/[^/]+/pdf|forms/files/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
