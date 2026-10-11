import type { Rect } from '../../types';

// Zoom locale: solo visivo, sul dispositivo del DM (non tocca la vista
// condivisa). Si salva solo sui cambi espliciti dell'utente, mai su un reset
// programmatico (cambio location, ingresso in pan).
export type LocalZoom = { scale: number; x: number; y: number };
export const ZOOM_LOCAL_MIN = 1;
export const ZOOM_LOCAL_MAX = 5;
const ZOOM_LOCAL_STATE_KEY = 'zoomLocalState';

export function loadLocalZoom(): LocalZoom {
  try {
    const raw = localStorage.getItem(ZOOM_LOCAL_STATE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.scale) && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        return { scale: Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, p.scale)), x: p.x, y: p.y };
      }
    }
  } catch { /* localStorage non disponibile o valore corrotto: default */ }
  return { scale: 1, x: 0, y: 0 };
}

export function saveLocalZoom(z: LocalZoom): void {
  try { localStorage.setItem(ZOOM_LOCAL_STATE_KEY, JSON.stringify(z)); } catch { /* vale solo per la sessione */ }
}

// Non lascia che il contenuto ingrandito scivoli fino a uscire del tutto
// dal riquadro visibile (w x h = dimensioni del contenitore).
export function clampLocalZoomPan(z: LocalZoom, w: number, h: number): LocalZoom {
  const maxX = (w * (z.scale - 1)) / 2;
  const maxY = (h * (z.scale - 1)) / 2;
  return { scale: z.scale, x: Math.min(maxX, Math.max(-maxX, z.x)) + 0, y: Math.min(maxY, Math.max(-maxY, z.y)) + 0 };
}

// Centra lo zoom sul rettangolo dato (pixel schermo dell'anteprima non
// zoomata). "Contain", non "cover": l'intera area deve restare visibile.
// Lo scale si applica intorno al centro del contenitore (transform-origin di
// default): il centro del rettangolo si sposta PRIMA della traslazione, che
// poi lo riporta al centro.
export function zoomToRect(rect: Rect, w: number, h: number): LocalZoom | null {
  if (!rect || !rect.width || !rect.height || !w || !h) return null;
  const scale = Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, Math.min(w / rect.width, h / rect.height)));
  const cx = w / 2;
  const cy = h / 2;
  const rectCenterX = rect.left + rect.width / 2;
  const rectCenterY = rect.top + rect.height / 2;
  const postScaleX = cx + (rectCenterX - cx) * scale;
  const postScaleY = cy + (rectCenterY - cy) * scale;
  return clampLocalZoomPan({ scale, x: cx - postScaleX, y: cy - postScaleY }, w, h);
}
