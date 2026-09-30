/**
 * The browser security headers, on every response (2026-09-30, after the owner asked
 * whether the app is protected from web attacks: it sent none of these). Next's
 * "without nonces" setup (node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md); a nonce-based policy, which drops 'unsafe-inline' for
 * scripts, is the stronger next step.
 *
 * Everything the pages use comes from this site: fonts are bundled at build time
 * (next/font), logos are data: URLs in the stylesheets, attachments are shrunk in a
 * canvas (blob:), and Google sign-in is a redirect, not a frame or a form post.
 *
 * The policy is NOT sent on the two private file addresses (an attachment, a count's
 * PDF): a policy on a PDF response blanked Chrome's PDF viewer once already (CLAUDE.md
 * §3), and those responses carry their own nosniff and no-store (lib/cash/serve.ts).
 * They still get every other header here, framing refused included.
 */

export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    // Next's own inline bootstrap needs 'unsafe-inline'; React's dev tools need eval.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
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

const EVERYWHERE = [
  // The old header for frame-ancestors, for browsers that predate it.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Addresses like /devops/164/66 are not sent to GitHub or Google.
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Nothing here uses the camera API (a photo is a file input), a microphone or location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/** For next.config.ts headers(). The CSP's source skips the two file addresses (see above). */
export function securityHeaders(dev: boolean) {
  return [
    { source: '/:path*', headers: EVERYWHERE },
    {
      source: '/((?!cash/files/|cash/count/[^/]+/pdf).*)',
      headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy(dev) }],
    },
  ];
}
