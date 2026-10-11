import { defineConfig } from 'vitest/config';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared';

export default defineConfig({
  base: '/editor/',
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: '../public/editor', emptyOutDir: true },
  server: { port: 5173, proxy: sharedProxy },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['src/test-setup.ts'] },
});
