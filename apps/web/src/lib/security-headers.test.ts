import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { contentSecurityPolicy, securityHeaders } from './security-headers';

const rules = securityHeaders(false);
const headersFor = (path: string) =>
  rules.filter((r) => pathToRegexp(r.source, []).test(path)).flatMap((r) => r.headers.map((h) => h.key));

describe('the security headers', () => {
  it('every page refuses framing, sniffing and leaking its address, and has the policy', () => {
    for (const p of ['/', '/apps', '/admin/access', '/cash/count/611', '/devops/164/66', '/tests']) {
      expect(headersFor(p)).toEqual(expect.arrayContaining(['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']));
    }
  });

  it('the two private file addresses get no policy (it blanked Chrome’s PDF viewer), but everything else', () => {
    for (const p of ['/cash/files/12', '/cash/count/611/pdf']) {
      expect(headersFor(p)).not.toContain('Content-Security-Policy');
      expect(headersFor(p)).toContain('X-Frame-Options');
    }
  });

  it('the policy: nothing from elsewhere, no plugins, no framing; eval only in development', () => {
    const prod = contentSecurityPolicy(false);
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) expect(prod).toContain(d);
    expect(prod).not.toContain('unsafe-eval');
    expect(prod).not.toMatch(/https?:|\*/);
    expect(contentSecurityPolicy(true)).toContain('unsafe-eval');
  });

  it('Next is wired to send them, and not to announce itself', async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(await nextConfig.headers!()).toEqual(securityHeaders(false));
  });
});
