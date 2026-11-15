import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export const BACKEND = process.env.VTT_BACKEND ?? 'http://localhost:3000';
export const sharedPlugins = () => [react(), tailwindcss()];
export const sharedAlias = { '@': path.resolve(import.meta.dirname, 'src') };
export const sharedProxy = {
  '/socket.io': { target: BACKEND, ws: true },
  '/api': BACKEND,
  '/storage': BACKEND,
  '/shared': BACKEND,
  // In sviluppo Vite antepone la base agli <script> classici dell'index.html
  // (/shared/media.js -> /control/shared/media.js): senza questi proxy davano 404.
  // (/party/shared e in vite.party.config.ts, dove la base dipende da PARTY_OUT.)
  ...Object.fromEntries(['control', 'editor'].map((app) => [
    `/${app}/shared`,
    { target: BACKEND, rewrite: (p: string) => p.slice(app.length + 1) },
  ])),
};
