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
};
