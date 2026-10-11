import type { Rect } from '@/types';
import { useControlStore } from '../store/control-store';

export type MapMedia = HTMLImageElement | HTMLVideoElement;

// Nodi DOM dell'anteprima mappa, scritti da MapPreview al mount: servono ai
// gesti (pan/fog/ping/zoom/aoe) e al loop degli shader, che lavorano fuori
// dal ciclo di render di React.
export const mapRefs = {
  preview: null as HTMLDivElement | null,
  fitBox: null as HTMLDivElement | null,
  media: null as MapMedia | null,
};

// Da coordinate client a punto in percentuale nello spazio BASE (non
// ruotato) della mappa, lo stesso spazio di poligoni fog, griglia e AOE.
// Il fit-box e gia ruotato visivamente dal CSS del wrap: la sua bounding
// box a schermo e quella post-rotazione, da cui rotatePointToBase risale
// allo spazio base (stessa logica di pingLocalCoords nel pannello vanilla).
export function clientToBasePoint(clientX: number, clientY: number, rect: Rect, rotation: number): Pt | null {
  if (!rect.width || !rect.height) return null;
  const rx = ((clientX - rect.left) / rect.width) * 100;
  const ry = ((clientY - rect.top) / rect.height) * 100;
  return rotatePointToBase([rx, ry], rotation);
}

// Variante legata all'anteprima montata: usa il fit-box corrente e la
// rotazione gia calcolata in `geometry`. null senza fit-box o senza
// location in anteprima.
export function eventToBasePoint(e: { clientX: number; clientY: number }): Pt | null {
  const fit = mapRefs.fitBox;
  const s = useControlStore.getState();
  if (!fit || !s.previewLocationId) return null;
  const r = fit.getBoundingClientRect();
  return clientToBasePoint(e.clientX, e.clientY, { left: r.left, top: r.top, width: r.width, height: r.height }, s.geometry.rotation);
}
