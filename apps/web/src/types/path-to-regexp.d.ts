// The path matcher Next itself uses for next.config headers() sources, which ships
// without types. Only for security-headers.test.ts, so the test matches paths exactly
// as Next will.
declare module 'next/dist/compiled/path-to-regexp' {
  export function pathToRegexp(path: string, keys?: unknown[]): RegExp;
}
