import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const BACKEND = process.env.VTT_BACKEND ?? 'http://localhost:3000';

export default defineConfig({
  base: '/editor-next/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: '../public/editor-next', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: BACKEND, ws: true },
      '/api': BACKEND,
      '/storage': BACKEND,
      '/shared': BACKEND,
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['src/test-setup.ts'] },
});
