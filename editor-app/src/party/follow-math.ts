export interface DisplayViewport { width: number; height: number }
export interface LiveTransform { offsetX: number; offsetY: number; scale: number }

// displayViewport noto e valido (un display si è connesso almeno una volta): solo
// allora il box ha la stessa proporzione dello schermo e k è un unico numero.
export function followsDisplay(v: { width?: number; height?: number } | null | undefined): boolean {
  return Boolean(v && v.width && v.height);
}

// Stessa formula di renderMap in display.js (scale = mapScale*live.scale); gli
// offset sono pixel dello schermo del display, qui il box è k volte più piccolo:
// vanno scalati di k, lo zoom (unitless) no. Senza display noto: null.
export function liveTransform(
  map: { scale?: number; liveView?: { scale?: number; offsetX?: number; offsetY?: number } } | undefined,
  v: DisplayViewport | null | undefined,
  boxWidth: number,
): LiveTransform | null {
  if (!v || !followsDisplay(v)) return null;
  const live = map?.liveView ?? {};
  const scale = (map?.scale || 1) * (live.scale || 1);
  const k = boxWidth / v.width;
  return { offsetX: (live.offsetX || 0) * k, offsetY: (live.offsetY || 0) * k, scale };
}

export function transformCss(t: LiveTransform | null): string {
  return t ? `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})` : 'none';
}

// La griglia resta a spessore costante sullo schermo (display.js fa lo stesso);
// il contorno AOE NO, come nell'originale.
export function gridLineWidth(lineWidth: number | undefined, scale: number): number {
  return (lineWidth || 0.3) / Math.max(scale, 0.01);
}
