import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    alias: {
      // `server-only` throws when imported outside a React server build. Tests import
      // server modules on purpose, so it is replaced by an empty module here only.
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
      '@/': fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
    },
  },
});
