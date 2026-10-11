import type { Rect } from '../../types';
import type { ControlLocation, DisplayViewport } from '../types';

// Dallo spazio locale (pre-rotazione) di un wrap di dimensioni effW x effH,
// centrato e ruotato di `rotation` gradi dentro un container contW x contH
// (poi eventualmente pannato/scalato di offX,offY/S -- S=1,offX=0,offY=0 per
// l'anteprima locale, che non panna/zooma mai se stessa), allo spazio
// schermo del container. Stessa composizione di #map-layer/#map-media-wrap
// usata da display.js.
export function localToScreen(
  lx: number, ly: number, effW: number, effH: number, contW: number, contH: number,
  rotation: number, S: number, offX: number, offY: number,
): [number, number] {
  const [rx, ry] = rotateVector(lx - effW / 2, ly - effH / 2, rotation);
  return [contW / 2 + S * rx + offX, contH / 2 + S * ry + offY];
}

// Inversa di localToScreen.
export function screenToLocal(
  sx: number, sy: number, effW: number, effH: number, contW: number, contH: number,
  rotation: number, S: number, offX: number, offY: number,
): [number, number] {
  const dx = (sx - offX - contW / 2) / S;
  const dy = (sy - offY - contH / 2) / S;
  const [rx, ry] = rotateVector(dx, dy, -rotation);
  return [effW / 2 + rx, effH / 2 + ry];
}

export interface ViewArgs {
  location: ControlLocation;
  displayViewport: DisplayViewport | null;
  naturalW: number; naturalH: number;
  imageRect: Rect | null;
  previewW: number; previewH: number; // mapPreview.clientWidth/Height
}

// Il rettangolo (in pixel schermo della NOSTRA anteprima, spazio non
// zoomato/pannato localmente) mostra quale porzione della mappa la TV sta
// inquadrando. Tre passi:
// 1) dai quattro angoli dello schermo della TV si risale, con screenToLocal,
//    al rettangolo nello spazio locale (pre-rotazione) del wrap della TV --
//    lo stesso spazio di tvFit -- e lo si riesprime come frazione di tvFit;
// 2) la stessa frazione si applica al riquadro mappa della nostra anteprima
//    (imageRect, pre-rotazione, calcolato con la stessa `rotation`);
// 3) dal locale allo schermo della nostra anteprima con localToScreen
//    (S=1, offset=0: si lavora sempre nello spazio NON zoomato).
export function computeViewportScreenRect(a: ViewArgs): Rect | null {
  const { location, displayViewport, naturalW: nw, naturalH: nh, imageRect } = a;
  if (!location || !displayViewport || !nw || !imageRect) return null;

  const { width: vw, height: vh } = displayViewport;
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? vh : vw;
  const tvEffectiveH = swapped ? vw : vh;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const live = location.map.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;

  // 1) Rotazioni di 0/90/180/270 mantengono il rettangolo dello schermo
  // allineato agli assi anche nello spazio locale: bastano due angoli opposti.
  const [x0, y0] = screenToLocal(0, 0, tvEffectiveW, tvEffectiveH, vw, vh, rotation, S, offsetX, offsetY);
  const [x1, y1] = screenToLocal(vw, vh, tvEffectiveW, tvEffectiveH, vw, vh, rotation, S, offsetX, offsetY);

  const viewLeft = Math.min(x0, x1);
  const viewTop = Math.min(y0, y1);
  const viewW = Math.abs(x1 - x0);
  const viewH = Math.abs(y1 - y0);

  const fracLeft = (viewLeft - tvFit.left) / tvFit.width;
  const fracTop = (viewTop - tvFit.top) / tvFit.height;
  const fracW = viewW / tvFit.width;
  const fracH = viewH / tvFit.height;

  // 2) Frazione applicata al riquadro locale della nostra anteprima.
  const localLeft = imageRect.left + fracLeft * imageRect.width;
  const localTop = imageRect.top + fracTop * imageRect.height;
  const localRight = localLeft + fracW * imageRect.width;
  const localBottom = localTop + fracH * imageRect.height;

  // 3) Dal locale allo schermo della nostra anteprima (S=1, offset=0).
  const contW = a.previewW, contH = a.previewH;
  const ctrlEffW = swapped ? contH : contW;
  const ctrlEffH = swapped ? contW : contH;
  const [sx0, sy0] = localToScreen(localLeft, localTop, ctrlEffW, ctrlEffH, contW, contH, rotation, 1, 0, 0);
  const [sx1, sy1] = localToScreen(localRight, localBottom, ctrlEffW, ctrlEffH, contW, contH, rotation, 1, 0, 0);

  return {
    left: Math.min(sx0, sx1),
    top: Math.min(sy0, sy1),
    width: Math.abs(sx1 - sx0),
    height: Math.abs(sy1 - sy0),
  };
}

// Delta di pan da inviare (`view:pan`) per un trascinamento di (dxLocal,
// dyLocal) pixel sulla nostra anteprima. Il delta e nello spazio SCHERMO
// (ruotato visivamente come la TV): va riportato nello spazio locale
// ruotandolo di -rotation (S=1), riscalato nello spazio locale di tvFit,
// ruotato IN AVANTI (+rotation) verso lo spazio schermo di map-layer sulla
// TV e moltiplicato per S -- con segno invertito, perche aumentare offsetX
// sposta il contenuto (non l'inquadratura) in quella direzione.
export function panDeltaForDrag(a: ViewArgs, dxLocal: number, dyLocal: number): { dx: number; dy: number } | null {
  const { location, displayViewport, naturalW: nw, naturalH: nh, imageRect } = a;
  if (!location || !displayViewport || !imageRect) return null;

  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? displayViewport.height : displayViewport.width;
  const tvEffectiveH = swapped ? displayViewport.width : displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((location.map.liveView && location.map.liveView.scale) || 1);

  const [dLocalX, dLocalY] = rotateVector(dxLocal, dyLocal, -rotation);
  const dViewLeft = (dLocalX / imageRect.width) * tvFit.width;
  const dViewTop = (dLocalY / imageRect.height) * tvFit.height;
  const [rx, ry] = rotateVector(dViewLeft, dViewTop, rotation);

  return { dx: -S * rx + 0, dy: -S * ry + 0 };
}
