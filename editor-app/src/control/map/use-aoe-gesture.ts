import { useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { AOE_TAP_THRESHOLD_PX } from '../aoe/constants';
import { selectAoeAvailable, selectPreviewLocation, useControlStore, type ControlStore } from '../store/control-store';
import { eventToBasePoint, mapRefs } from './map-refs';
import { capturePointer } from './use-pan-gesture';

// Stato del gesto: variabili di modulo, mai stato React (un render remoto,
// es. state:update a meta trascinamento, non deve toccarle).
// Inizio di un possibile tap su area vuota, in pixel client.
let aoePlaceStart: { x: number; y: number; pointerId: number } | null = null;
// targetX/targetY inseguono la posizione NON agganciata (dove il dito sta
// davvero trascinando): ripartendo ogni volta dall'ultima posizione gia
// agganciata, un movimento piu piccolo di un passo di griglia verrebbe
// arrotondato via a ogni evento e la forma non si muoverebbe mai finche lo
// spostamento accumulato non supera un passo intero.
let aoeDrag: { id: string; pointerId: number; lastBaseX: number; lastBaseY: number; targetX: number; targetY: number } | null = null;

function aoeActive(s: ControlStore): boolean {
  return s.mode === 'aoe' && selectAoeAvailable(s);
}

// Aggancia alla griglia (snapAoeOrigin in media.js) quando la mappa ha una
// griglia attiva; senza griglia il posizionamento resta libero.
function snapAoePlacement(s: ControlStore, shape: string, sizeM: number, widthM: number | undefined, rotation: number, x: number, y: number): Pt {
  const grid = selectPreviewLocation(s)?.map.grid;
  return snapAoeOrigin(shape, sizeM, widthM as number, rotation, grid as never, x, y, s.geometry.naturalW, s.geometry.naturalH);
}

// Modalita "aoe" (porting di control.js): un tap su un'area vuota della
// mappa piazza una nuova area con forma/colore/taglia correnti; un
// trascinamento che parte da un contorno gia disegnato la seleziona e la
// sposta invece di piazzarne una nuova.
export function useAoeGesture(opts: { isActive?: (s: ControlStore) => boolean } = {}) {
  const isActiveRef = useRef(opts.isActive ?? aoeActive);
  isActiveRef.current = opts.isActive ?? aoeActive;
  useEffect(() => {
    const fit = mapRefs.fitBox;
    if (!fit) return;

    const onDown = (e: PointerEvent) => {
      const s = useControlStore.getState();
      if (!isActiveRef.current(s)) return;
      const overlay = (e.target as Element | null)?.closest?.('.aoe-shape-overlay') as SVGElement | null;
      if (overlay) {
        const id = overlay.dataset.id;
        const aoe = selectPreviewLocation(s)?.map.aoes.find((a) => a.id === id);
        const point = eventToBasePoint(e);
        if (!aoe || !point) return;
        aoeDrag = { id: aoe.id, pointerId: e.pointerId, lastBaseX: point[0], lastBaseY: point[1], targetX: aoe.x, targetY: aoe.y };
        s.selectAoe(aoe.id);
        capturePointer(fit, e.pointerId);
      } else {
        aoePlaceStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      }
    };

    const onMove = (e: PointerEvent) => {
      const s = useControlStore.getState();
      if (!isActiveRef.current(s)) { aoeDrag = null; return; }
      if (!aoeDrag || e.pointerId !== aoeDrag.pointerId) return;
      const point = eventToBasePoint(e);
      if (!point) return;
      const aoe = selectPreviewLocation(s)?.map.aoes.find((a) => a.id === aoeDrag!.id);
      if (!aoe) return;
      // Delta dall'ultima posizione del puntatore, non posizione assoluta:
      // la forma segue il dito da dove l'hai afferrata invece di saltare a
      // ricentrarsi sotto il cursore.
      aoeDrag.targetX += point[0] - aoeDrag.lastBaseX;
      aoeDrag.targetY += point[1] - aoeDrag.lastBaseY;
      aoeDrag.lastBaseX = point[0];
      aoeDrag.lastBaseY = point[1];
      const [x, y] = snapAoePlacement(s, aoe.shape, aoe.sizeM, aoe.widthM, aoe.rotation, aoeDrag.targetX, aoeDrag.targetY);
      socket.emit('aoe:move', { locationId: s.previewLocationId, aoeId: aoeDrag.id, x, y });
    };

    const onUp = (e: PointerEvent) => {
      const s = useControlStore.getState();
      if (!isActiveRef.current(s)) { aoeDrag = null; aoePlaceStart = null; return; }
      if (aoeDrag && e.pointerId === aoeDrag.pointerId) { aoeDrag = null; return; }
      if (!aoePlaceStart || e.pointerId !== aoePlaceStart.pointerId) return;
      const { x: startX, y: startY } = aoePlaceStart;
      aoePlaceStart = null;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > AOE_TAP_THRESHOLD_PX) return;
      const point = eventToBasePoint(e);
      if (!point) return;
      const widthM = s.aoeShape === 'line' ? s.aoeWidth : undefined;
      const [x, y] = snapAoePlacement(s, s.aoeShape, s.aoeSize, widthM, 0, point[0], point[1]);
      socket.emit('aoe:place', {
        locationId: s.previewLocationId,
        shape: s.aoeShape,
        color: s.aoeColor,
        shaderOverride: s.aoeShaderOverride,
        sizeM: s.aoeSize,
        widthM,
        x,
        y,
      });
    };

    const onCancel = (e: PointerEvent) => {
      if (aoeDrag && e.pointerId === aoeDrag.pointerId) aoeDrag = null;
      if (aoePlaceStart && e.pointerId === aoePlaceStart.pointerId) aoePlaceStart = null;
    };

    // Cambio modalita a meta gesto: nessun gesto resta appeso. Un
    // state:update remoto che NON cambia modalita lascia il drag intatto.
    const unsub = useControlStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode) { aoeDrag = null; aoePlaceStart = null; }
    });

    fit.addEventListener('pointerdown', onDown);
    fit.addEventListener('pointermove', onMove);
    fit.addEventListener('pointerup', onUp);
    fit.addEventListener('pointercancel', onCancel);
    return () => {
      unsub();
      aoeDrag = null;
      aoePlaceStart = null;
      fit.removeEventListener('pointerdown', onDown);
      fit.removeEventListener('pointermove', onMove);
      fit.removeEventListener('pointerup', onUp);
      fit.removeEventListener('pointercancel', onCancel);
    };
  }, []);
}
