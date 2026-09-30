import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// One .env.local, at the repo root, shared with drizzle-kit and the import scripts.
// Next looks only in apps/web. Not @next/env's loadEnvConfig: Next has already called
// it by now, and it returns its cached first result, so a second call does nothing.
// process.loadEnvFile never overrides a variable already set, and on Vercel there is
// no file, so the platform's variables are used.
const rootEnv = path.resolve(process.cwd(), "../../.env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": it only tells an attacker what to try.
  poweredByHeader: false,
  async headers() {
    return securityHeaders(process.env.NODE_ENV === "development");
  },
  // Cash Balancing attachments come through a server action: 4 MB files (the old
  // app's limit), plus the form around them. Vercel caps any request at 4.5 MB, so
  // New Count shrinks phone photos before sending them (components/cash/attachments).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  // The two group pages became one Applications page (2026-09-26). Not permanent: a
  // browser keeps a permanent redirect forever, and these paths may be wanted back.
  async redirects() {
    return [{ source: "/apps/:group(internal|external)", destination: "/apps", permanent: false }];
  },
};

export default nextConfig;
