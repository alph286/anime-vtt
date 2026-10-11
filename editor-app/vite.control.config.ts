import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared.ts';

// La build esce in public/control/ (base /control/), servito da Express. CONTROL_OUT permette
// di costruire altrove (es. una cartella di prova) senza toccare quella committata.
const OUT = process.env.CONTROL_OUT ?? 'control';
// emptyOutDir svuota la cartella: niente nomi vuoti, con percorsi o che puntino a un'altra app.
if (!/^[a-z0-9-]+$/.test(OUT) || ['editor', 'shared', 'home', 'display', 'party'].includes(OUT)) {
  throw new Error(`CONTROL_OUT non valido ("${OUT}"): usa solo lettere minuscole, cifre e trattini, e non il nome di un'altra app (editor, shared, home, display, party).`);
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'control'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5174, proxy: sharedProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
