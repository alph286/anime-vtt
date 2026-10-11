import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { panDeltaForDrag } from '../lib/view-math';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { mapRefs } from './map-refs';

// Stato del trascinamento: variabile di modulo, mai stato React (cambia ad
// ogni pointermove e non deve provocare render).
let panDrag: { lastX: number; lastY: number } | null = null;

// Un tocco che parte dai pulsanti modalita non deve mai innescare la
// capture: altrimenti il click risultante verrebbe rediretto al preview
// invece che al pulsante, e spegnere la modalita con un tocco reale
// diventerebbe impossibile (setPointerCapture ridirige il click). Oggi la
// riga dei pulsanti sta fuori dal preview, ma il guard resta come nell'originale.
export function startsOnModeToggles(e: Event): boolean {
  return Boolean((e.target as Element | null)?.closest?.('#map-mode-toggles'));
}

// Capture difensiva: con un pointer non piu attivo (o sintetico) il browser
// lancia NotFoundError, che non deve rompere il gesto.
export function capturePointer(el: HTMLElement, pointerId: number) {
  try { el.setPointerCapture?.(pointerId); } catch { /* pointer non attivo: si va avanti senza capture */ }
}

// Modalita "sposta" (porting di control.js): ogni gesto sull'anteprima e un
// trascinamento dell'inquadratura dei giocatori. Il delta in pixel della
// NOSTRA anteprima diventa un delta in pixel dello schermo della TV con
// panDeltaForDrag; senza displayViewport o imageRect non si emette nulla.
export function usePanGesture() {
  useEffect(() => {
    const preview = mapRefs.preview;
    if (!preview) return;

    const onDown = (e: PointerEvent) => {
      if (useControlStore.getState().mode !== 'pan' || startsOnModeToggles(e)) return;
      panDrag = { lastX: e.clientX, lastY: e.clientY };
      capturePointer(preview, e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!panDrag) return;
      const s = useControlStore.getState();
      if (s.mode !== 'pan') { panDrag = null; return; }
      const dxLocal = e.clientX - panDrag.lastX;
      const dyLocal = e.clientY - panDrag.lastY;
      panDrag.lastX = e.clientX;
      panDrag.lastY = e.clientY;

      const location = selectPreviewLocation(s);
      const g = s.geometry;
      if (!location) return;
      const d = panDeltaForDrag({
        location, displayViewport: s.server?.displayViewport ?? null,
        naturalW: g.naturalW, naturalH: g.naturalH, imageRect: g.imageRect,
        previewW: g.previewW, previewH: g.previewH,
      }, dxLocal, dyLocal);
      // Senza mappa caricata (naturalW 0) la matematica darebbe NaN.
      if (!d || !Number.isFinite(d.dx) || !Number.isFinite(d.dy)) return;
      socket.emit('view:pan', { locationId: s.previewLocationId, dx: d.dx, dy: d.dy });
    };

    const onEnd = () => { panDrag = null; };

    // Cambio modalita a meta gesto: nessun trascinamento resta appeso. Un
    // aggiornamento remoto dello stato invece NON lo interrompe.
    const unsub = useControlStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode) panDrag = null;
    });

    preview.addEventListener('pointerdown', onDown);
    preview.addEventListener('pointermove', onMove);
    preview.addEventListener('pointerup', onEnd);
    preview.addEventListener('pointercancel', onEnd);
    return () => {
      unsub();
      panDrag = null;
      preview.removeEventListener('pointerdown', onDown);
      preview.removeEventListener('pointermove', onMove);
      preview.removeEventListener('pointerup', onEnd);
      preview.removeEventListener('pointercancel', onEnd);
    };
  }, []);
}
