import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { BACKEND, sharedAlias, sharedPlugins, sharedProxy } from './vite.shared.ts';

// La build esce in public/party/ (base /party/), servito da Express. PARTY_OUT permette
// di costruire altrove (es. una cartella di prova) senza toccare quella committata.
const OUT = process.env.PARTY_OUT ?? 'party';
// emptyOutDir svuota la cartella: niente nomi vuoti, con percorsi o che puntino a un'altra app.
if (!/^[a-z0-9-]+$/.test(OUT) || ['editor', 'shared', 'home', 'display', 'control'].includes(OUT)) {
  throw new Error(`PARTY_OUT non valido ("${OUT}"): usa solo lettere minuscole, cifre e trattini, e non il nome di un'altra app (editor, shared, home, display, control).`);
}

// In sviluppo Vite riscrive gli src assoluti dell'index.html anteponendo la base
// (/shared/media.js -> /party/shared/media.js), che il proxy /shared non intercetta:
// gli script classici davano 404 e lo store falliva (AOE_METERS_PER_CELL non definita).
// In build gli <script> non-module restano /shared/... e li serve Express.
const devProxy = {
  ...sharedProxy,
  [`/${OUT}/shared`]: { target: BACKEND, rewrite: (p: string) => p.slice(OUT.length + 1) },
};

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'party'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5175, proxy: devProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
