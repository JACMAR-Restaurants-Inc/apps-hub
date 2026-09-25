import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// One .env.local, at the repo root, shared with drizzle-kit and the import scripts.
// Next looks only in apps/web. Not @next/env's loadEnvConfig: Next has already called
// it by now, and it returns its cached first result, so a second call does nothing.
// process.loadEnvFile never overrides a variable already set, and on Vercel there is
// no file, so the platform's variables are used.
const rootEnv = path.resolve(process.cwd(), "../../.env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {};

export default nextConfig;
