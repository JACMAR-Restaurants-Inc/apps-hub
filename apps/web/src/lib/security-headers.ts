/**
 * The browser security headers (2026-09-30, after the owner asked whether the app is
 * protected from web attacks: it sent none of these).
 *
 * The Content-Security-Policy is NONCE-based (the same day, the stronger step after
 * Next's "without nonces" policy): src/proxy.ts makes a fresh random nonce for every
 * page request, and only scripts carrying it run. Next puts it on its own scripts by
 * itself, reading it from the policy on the request. So an injected <script> does not
 * run, which 'unsafe-inline' used to allow. Every page must render per request for
 * this (a page built in advance has no nonce): the root layout calls connection().
 *
 * Styles keep 'unsafe-inline': the pages use style={...} attributes, which a nonce
 * cannot cover, and a nonce in style-src would switch 'unsafe-inline' off.
 *
 * Everything the pages use comes from this site: fonts are bundled at build time
 * (next/font), logos are data: URLs in the stylesheets, attachments are shrunk in a
 * canvas (blob:), and Google sign-in is a redirect, not a frame or a form post.
 *
 * The policy is NOT sent on the two private file addresses (an attachment, a count's
 * PDF; the proxy skips them): a policy on a PDF response blanked Chrome's PDF viewer
 * once already (CLAUDE.md §3), and those responses carry their own nosniff and no-store
 * (lib/cash/serve.ts). They still get every other header here, framing refused included.
 */

export function contentSecurityPolicy(dev: boolean, nonce: string): string {
  return [
    "default-src 'self'",
    // Only scripts with this request's nonce, and what they load ('strict-dynamic').
    // React's dev tools need eval, in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The dev server's hot reload is a websocket on the same host.
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Nobody may show these pages inside theirs: no clickjacking an admin's Grant button.
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** 128 random bits, base64: new for every page request. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

const EVERYWHERE = [
  // The old header for frame-ancestors, for browsers that predate it.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Addresses like /devops/164/66 are not sent to GitHub or Google.
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Nothing here uses the camera API (a photo is a file input), a microphone or location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/** For next.config.ts headers(): everything but the policy, which src/proxy.ts sets. */
export function securityHeaders() {
  return [{ source: '/:path*', headers: EVERYWHERE }];
}
