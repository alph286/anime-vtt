import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared';

// Durante lo sviluppo del porting la build esce in public/control-next/ (base /control-next/);
// il cutover (ultimo task del piano) la sposta su /control.
const OUT = process.env.CONTROL_OUT ?? 'control-next';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'control'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5174, proxy: sharedProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
