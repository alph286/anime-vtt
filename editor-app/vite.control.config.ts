import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared.ts';

// La build esce in public/control/ (base /control/), servito da Express. CONTROL_OUT permette
// di costruire altrove (es. una cartella di prova) senza toccare quella committata.
const OUT = process.env.CONTROL_OUT ?? 'control';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'control'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5174, proxy: sharedProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
