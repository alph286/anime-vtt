import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { newPingStrokeId, PING_MIN_POINT_DIST_PCT } from '../lib/ping';
import { selectPingAvailable, useControlStore } from '../store/control-store';
import { eventToBasePoint, mapRefs } from './map-refs';
import { capturePointer } from './use-pan-gesture';

// Trascinamento in corso: variabile di modulo, mai stato React. Coordinate
// in % dello spazio base (post-rotazione) dell'ultimo punto EMESSO.
let pingDrag: { id: number; strokeId: string; lastX: number; lastY: number } | null = null;

// Modalita "ping" (porting di control.js): l'ascoltatore vive sul fit-box,
// cosi il tap arriva ovunque sulla mappa, non solo dentro un poligono fog.
// Tap fermo e trascinamento sono lo stesso gesto: pointerdown emette subito
// il primo punto, pointermove ne emette altri solo oltre
// PING_MIN_POINT_DIST_PCT dall'ultimo emesso; un tap senza movimento resta
// una "scia" di un solo punto (il sonar). Il punto NON viene aggiunto qui
// al buffer locale: arriva dall'eco `ping:show` del server, come per i
// giocatori (vedi use-control-socket.ts).
export function usePingGesture() {
  useEffect(() => {
    const fit = mapRefs.fitBox;
    if (!fit) return;

    const onDown = (e: PointerEvent) => {
      const s = useControlStore.getState();
      if (s.mode !== 'ping' || !selectPingAvailable(s)) return;
      const p = eventToBasePoint(e);
      if (!p) return;
      const [x, y] = p;
      const strokeId = newPingStrokeId();
      pingDrag = { id: e.pointerId, strokeId, lastX: x, lastY: y };
      capturePointer(fit, e.pointerId);
      socket.emit('ping:show', { locationId: s.previewLocationId, x, y, strokeId });
    };

    const onMove = (e: PointerEvent) => {
      if (!pingDrag || e.pointerId !== pingDrag.id) return;
      const s = useControlStore.getState();
      if (s.mode !== 'ping' || !selectPingAvailable(s)) { pingDrag = null; return; }
      const p = eventToBasePoint(e);
      if (!p) return;
      const [x, y] = p;
      if (Math.hypot(x - pingDrag.lastX, y - pingDrag.lastY) < PING_MIN_POINT_DIST_PCT) return;
      pingDrag.lastX = x;
      pingDrag.lastY = y;
      socket.emit('ping:show', { locationId: s.previewLocationId, x, y, strokeId: pingDrag.strokeId });
    };

    const onEnd = (e: PointerEvent) => {
      if (pingDrag && e.pointerId === pingDrag.id) pingDrag = null;
    };

    // Cambio modalita a meta gesto: nessun trascinamento resta appeso.
    const unsub = useControlStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode) pingDrag = null;
    });

    fit.addEventListener('pointerdown', onDown);
    fit.addEventListener('pointermove', onMove);
    fit.addEventListener('pointerup', onEnd);
    fit.addEventListener('pointercancel', onEnd);
    return () => {
      unsub();
      pingDrag = null;
      fit.removeEventListener('pointerdown', onDown);
      fit.removeEventListener('pointermove', onMove);
      fit.removeEventListener('pointerup', onEnd);
      fit.removeEventListener('pointercancel', onEnd);
    };
  }, []);
}
