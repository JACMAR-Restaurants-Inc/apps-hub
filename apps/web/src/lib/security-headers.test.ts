import { NextRequest } from 'next/server';
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { config, proxy } from '../proxy';
import { contentSecurityPolicy, newNonce, securityHeaders } from './security-headers';

const everywhere = securityHeaders();
const configHeaders = (path: string) =>
  everywhere.filter((r) => pathToRegexp(r.source, []).test(path)).flatMap((r) => r.headers.map((h) => h.key));
const proxied = (path: string) => pathToRegexp(config.matcher[0]!.source, []).test(path);
const scriptSrc = (policy: string) => policy.split('; ').find((d) => d.startsWith('script-src '))!;

describe('the security headers', () => {
  it('every address refuses framing, sniffing and leaking its address', () => {
    for (const p of ['/', '/apps', '/admin/access', '/cash/count/611', '/cash/files/12', '/cash/count/611/pdf', '/devops/164/66', '/api/auth/x']) {
      expect(configHeaders(p)).toEqual(expect.arrayContaining(['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']));
    }
  });

  it('Next is wired to send them, and not to announce itself; the policy is the proxy’s alone', async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(await nextConfig.headers!()).toEqual(securityHeaders());
    expect(JSON.stringify(securityHeaders())).not.toContain('Content-Security-Policy');
  });
});

describe('the nonce policy', () => {
  it('scripts run only with this request’s nonce: no unsafe-inline, no eval in production', () => {
    const s = scriptSrc(contentSecurityPolicy(false, 'N0nce'));
    expect(s).toContain("'nonce-N0nce'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain('unsafe-inline');
    expect(s).not.toContain('unsafe-eval');
    expect(scriptSrc(contentSecurityPolicy(true, 'N0nce'))).toContain('unsafe-eval');
  });

  it('keeps the rest: nothing from elsewhere, no plugins, no framing, no posting forms away', () => {
    const p = contentSecurityPolicy(false, 'x');
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) expect(p).toContain(d);
    expect(p).not.toMatch(/https?:|\*/);
    // style attributes need unsafe-inline, which a nonce in style-src would switch off.
    expect(p).toContain("style-src 'self' 'unsafe-inline'");
    expect(p.split('; ').find((d) => d.startsWith('style-src'))).not.toContain('nonce-');
  });

  it('a nonce is 128 random bits, new every time', () => {
    expect(atob(newNonce())).toHaveLength(16);
    expect(new Set(Array.from({ length: 50 }, newNonce)).size).toBe(50);
  });

  it('the proxy puts one fresh nonce on the request (for Next) and on the response (for the browser)', () => {
    const one = proxy(new NextRequest('https://hub.test/'));
    const two = proxy(new NextRequest('https://hub.test/'));
    const policy = one.headers.get('Content-Security-Policy')!;
    expect(policy).toMatch(/'nonce-[A-Za-z0-9+/=]{24}'/);
    expect(two.headers.get('Content-Security-Policy')).not.toBe(policy);
    // What Next hands the renderer: the same policy on the request.
    expect(one.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  });

  it('runs on pages, never on the two file addresses, API routes or built files', () => {
    for (const p of ['/', '/apps', '/cash/count/611', '/devops/164/66', '/tests', '/nope']) expect(proxied(p), p).toBe(true);
    for (const p of ['/cash/files/12', '/cash/count/611/pdf', '/api/auth/callback/google', '/api/cash/sweep', '/_next/static/chunks/a.js', '/brand/jm-portal-mark.png', '/manifest.webmanifest']) {
      expect(proxied(p), p).toBe(false);
    }
  });
});
