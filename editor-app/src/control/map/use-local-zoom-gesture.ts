import { useEffect } from 'react';
import {
  clampLocalZoomPan, saveLocalZoom, ZOOM_LOCAL_MAX, ZOOM_LOCAL_MIN, type LocalZoom,
} from '../lib/local-zoom';
import { useControlStore } from '../store/control-store';
import { mapRefs } from './map-refs';
import { capturePointer, startsOnModeToggles } from './use-pan-gesture';

const ZOOM_WHEEL_STEP = 0.1;

// Stato del gesto: variabili di modulo, mai stato React.
const pointers = new Map<number, { x: number; y: number }>();
let pinchStartDist: number | null = null;
let pinchStartScale = 1;
let dragLast: { x: number; y: number } | null = null;

function resetGesture(preview: HTMLElement | null) {
  pointers.clear();
  pinchStartDist = null;
  dragLast = null;
  preview?.classList.remove('zoom-dragging');
}

const clampScale = (v: number) => Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// Durante il gesto lo store si aggiorna senza salvare (il transform lo
// applica MapPreview); si salva solo a fine gesto o sulla rotellina.
function apply(preview: HTMLElement, z: LocalZoom) {
  useControlStore.getState().setLocalZoom(
    clampLocalZoomPan(z, preview.clientWidth, preview.clientHeight),
    { persist: false },
  );
}

// Zoom locale (porting di control.js): solo visivo, sul dispositivo del DM.
// Pinch a due dita con una Map di puntatori; trascinamento a un dito solo
// quando lo zoom e > 1 (a scala 1 non c'e nulla da spostare); rotellina per
// il mouse, che non ha pinch.
export function useLocalZoomGesture() {
  useEffect(() => {
    const preview = mapRefs.preview;
    if (!preview) return;

    const onDown = (e: PointerEvent) => {
      if (useControlStore.getState().mode !== 'zoom' || startsOnModeToggles(e)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      capturePointer(preview, e.pointerId);
      if (pointers.size === 1) {
        dragLast = { x: e.clientX, y: e.clientY };
        preview.classList.add('zoom-dragging');
      } else if (pointers.size === 2) {
        dragLast = null;
        const [p1, p2] = [...pointers.values()];
        pinchStartDist = dist(p1, p2);
        pinchStartScale = useControlStore.getState().localZoom.scale;
      }
    };

    const onMove = (e: PointerEvent) => {
      const s = useControlStore.getState();
      if (s.mode !== 'zoom' || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        const [p1, p2] = [...pointers.values()];
        if (pinchStartDist) {
          apply(preview, { ...s.localZoom, scale: clampScale(pinchStartScale * (dist(p1, p2) / pinchStartDist)) });
        }
        return;
      }

      if (dragLast && s.localZoom.scale > 1) {
        const z = s.localZoom;
        apply(preview, { scale: z.scale, x: z.x + e.clientX - dragLast.x, y: z.y + e.clientY - dragLast.y });
      }
      dragLast = { x: e.clientX, y: e.clientY };
    };

    const onEnd = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = null;
      if (pointers.size === 1) {
        dragLast = { ...[...pointers.values()][0] };
      } else if (pointers.size === 0) {
        dragLast = null;
        preview.classList.remove('zoom-dragging');
        saveLocalZoom(useControlStore.getState().localZoom);
      }
    };

    // { passive: false } serve perche preventDefault funzioni: di default i
    // listener 'wheel' sono passive e lo ignorerebbero, lasciando scrollare
    // la pagina sotto.
    const onWheel = (e: WheelEvent) => {
      const s = useControlStore.getState();
      if (s.mode !== 'zoom') return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;
      const scale = clampScale(Math.round((s.localZoom.scale + delta) * 10) / 10);
      const z = clampLocalZoomPan({ ...s.localZoom, scale }, preview.clientWidth, preview.clientHeight);
      s.setLocalZoom(z, { persist: true });
    };

    // Cambio modalita o di location in anteprima a meta gesto: puntatori e
    // classe azzerati (come resetLocalZoom nell'originale). Un aggiornamento
    // remoto dello stato invece non tocca il gesto.
    const unsub = useControlStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.previewLocationId !== prev.previewLocationId) resetGesture(preview);
    });

    preview.addEventListener('pointerdown', onDown);
    preview.addEventListener('pointermove', onMove);
    preview.addEventListener('pointerup', onEnd);
    preview.addEventListener('pointercancel', onEnd);
    preview.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      unsub();
      resetGesture(preview);
      preview.removeEventListener('pointerdown', onDown);
      preview.removeEventListener('pointermove', onMove);
      preview.removeEventListener('pointerup', onEnd);
      preview.removeEventListener('pointercancel', onEnd);
      preview.removeEventListener('wheel', onWheel);
    };
  }, []);
}
