import type { Grid } from '../../types';
import type { Aoe, AoeShape, ControlLocation } from '../types';

// Ridimensionare un'area gia piazzata puo rompere l'aggancio alla griglia
// (es. taglia che cambia parita): si ricalcola l'origine con snapAoeOrigin a
// partire dalla posizione attuale. Ritorna il payload per `aoe:resize`
// (senza locationId).
export function resizePayload(aoe: Aoe, dSize: number, dWidth: number, grid: Grid | undefined, nw: number, nh: number) {
  const sizeM = Math.max(AOE_METERS_PER_CELL, aoe.sizeM + dSize);
  const widthM = aoe.shape === 'line'
    ? Math.max(AOE_METERS_PER_CELL, (aoe.widthM || AOE_METERS_PER_CELL) + dWidth)
    : aoe.widthM;
  const [x, y] = snapAoeOrigin(aoe.shape, sizeM, widthM as number, aoe.rotation, grid as Grid, aoe.x, aoe.y, nw, nh);
  return { aoeId: aoe.id, sizeM, widthM, x, y };
}

// Per Cono e Linea il punto valido (vertice o centro-lato/cella) dipende
// dall'angolo: senza ri-agganciare qui l'origine resterebbe ferma mentre la
// regola cambia sotto di lei. Payload per `aoe:rotate`.
export function rotatePayload(aoe: Aoe, delta: number, grid: Grid | undefined, nw: number, nh: number) {
  const rotation = (((aoe.rotation + delta) % 360) + 360) % 360;
  const [x, y] = snapAoeOrigin(aoe.shape, aoe.sizeM, aoe.widthM as number, rotation, grid as Grid, aoe.x, aoe.y, nw, nh);
  return { aoeId: aoe.id, rotation, x, y };
}

// Sposta l'origine di esattamente 1 cella nella direzione data, poi
// ri-applica lo snap. dx/dy sono direzioni SCHERMO (il tasto "su" preme
// sempre verso l'alto sullo schermo): rotateDirectionToBase le converte nella
// direzione base, altrimenti con la mappa ruotata "su" sposterebbe di lato.
// Payload per `aoe:move`, o null se la griglia non c'e / le dimensioni
// naturali non sono note.
export function nudgePayload(aoe: Aoe, dx: number, dy: number, loc: ControlLocation, nw: number, nh: number) {
  const grid = loc.map.grid;
  if (!grid || !grid.enabled) return null;
  if (!nw || !nh) return null;
  const rotation = computeTotalRotation(nw, nh, loc.map.flip180, loc.map.rotate90);
  const [baseDx, baseDy] = rotateDirectionToBase([dx, dy], rotation);
  const stepXPct = (grid.cellSize / nw) * 100;
  const stepYPct = (grid.cellSize / nh) * 100;
  const rawX = Math.min(100, Math.max(0, aoe.x + baseDx * stepXPct));
  const rawY = Math.min(100, Math.max(0, aoe.y + baseDy * stepYPct));
  const [x, y] = snapAoeOrigin(aoe.shape, aoe.sizeM, aoe.widthM as number, aoe.rotation, grid, rawX, rawY, nw, nh);
  return { aoeId: aoe.id, x, y };
}

// Cicla solo i colori della color bar (AOE_COLOR_CYCLE_NAMES), mai `purple`
// (riservato all'evidenziazione di Viola Cornelia). Se il colore attuale non
// e tra quelli ciclabili si riparte dal primo.
export function nextCycleColor(current: string): string {
  const names = AOE_COLOR_CYCLE_NAMES;
  const idx = names.indexOf(current);
  return names[(idx + 1) % names.length];
}

export function aoeShapeLabel(shape: AoeShape | string): string {
  const labels: Record<string, string> = { cone: 'Cono', cube: 'Cubo', sphere: 'Sfera', line: 'Linea' };
  return labels[shape] || shape;
}

// Lo stepper principale regola grandezze diverse secondo la forma: dirlo
// esplicitamente evita che "3 m" sulla Sfera sia letto come diametro (e il
// raggio, sizeM).
export function aoeSizeDimensionLabel(shape: AoeShape | string): string {
  const labels: Record<string, string> = { cone: 'Lunghezza', cube: 'Lato', sphere: 'Raggio', line: 'Lunghezza' };
  return labels[shape] || 'Taglia';
}

export function formatMeters(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 1 });
}
