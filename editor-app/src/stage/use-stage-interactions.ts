import { useEffect } from 'react';
import { constrainSquare } from '@/lib/grid-math';
import { clamp } from '@/lib/numbers';
import { polygonMoved, translatePolygon } from '@/lib/polygon-math';
import { resizeFromFixedCorner, rectCorners } from '@/lib/shader-math';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { Point } from '@/types';
import { applyGridAlignment, applyShaderPlacement, recordPolygonMove } from './actions';
import { dragState } from './drag-state';
import type { MapMedia } from './MapStage';

type BoxDrag = { start: Point; end?: Point; box: HTMLDivElement };

export function useStageInteractions(mediaRef: React.MutableRefObject<MapMedia | null>) {
  useEffect(() => {
    const overlay = document.getElementById('overlay-box') as HTMLDivElement | null;
    if (!overlay) return;
    const store = () => useEditorStore.getState();

    let gridAlignDrag: BoxDrag | null = null;
    let shaderPlaceDrag: BoxDrag | null = null;
    let draggingPolygon: { locationId: string; polygonId: string; startBase: Point; originalPoints: Point[] } | null = null;
    let draggingShader: { locationId: string; id: string; startBase: Point; originalX: number; originalY: number } | null = null;

    const natural = () => {
      const m = mediaRef.current;
      return { w: m ? mediaW(m) : 0, h: m ? mediaH(m) : 0 };
    };

    // Punto in percentuale nello spazio "base" (non ruotato) della mappa.
    const basePoint = (clientX: number, clientY: number): Point => {
      const r = overlay.getBoundingClientRect();
      const p: Point = [clamp(((clientX - r.left) / r.width) * 100, 0, 100), clamp(((clientY - r.top) / r.height) * 100, 0, 100)];
      return rotatePointToBase(p, store().geometry.rotation) as Point;
    };

    const placeBox = (box: HTMLDivElement, start: Point, end: Point, square: boolean) => {
      const rect = store().geometry.imageRect;
      if (!rect) return;
      const left = Math.min(start[0], end[0]);
      const top = Math.min(start[1], end[1]);
      let width = Math.abs(end[0] - start[0]);
      let height = Math.abs(end[1] - start[1]);
      if (square) {
        const { w, h } = natural();
        if (w && h) ({ width, height } = constrainSquare(width, height, w, h));
      }
      box.style.left = `${(left / 100) * rect.width}px`;
      box.style.top = `${(top / 100) * rect.height}px`;
      box.style.width = `${(width / 100) * rect.width}px`;
      box.style.height = `${(height / 100) * rect.height}px`;
    };

    const onClick = (e: MouseEvent) => {
      if (store().mode !== 'draw') return;
      store().addDrawPoint(basePoint(e.clientX, e.clientY));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) return;
      // Le maniglie (React) gestiscono da sole il proprio drag: il listener nativo sull'overlay
      // scatta PRIMA di quello delegato di React, quindi stopPropagation() lì non basta.
      if (e.target instanceof Element && e.target.closest('.vertex-handle, .shader-handle')) return;
      const s = store();

      if (s.mode === 'shader-place' || s.mode === 'grid-align') {
        const start = basePoint(e.clientX, e.clientY);
        const box = document.createElement('div');
        box.className = s.mode === 'shader-place' ? 'shader-box' : 'grid-align-box';
        overlay.appendChild(box);
        const drag: BoxDrag = { start, box };
        if (s.mode === 'shader-place') shaderPlaceDrag = drag;
        else gridAlignDrag = drag;
        placeBox(box, start, start, s.mode === 'grid-align' && s.gridSquareConstrain);
        return;
      }

      if (s.mode !== 'select') return;
      const loc = selectActiveLocation(s);
      if (!loc) return;
      const point = basePoint(e.clientX, e.clientY);
      const { w: nw, h: nh } = natural();

      // Le decorazioni si testano PRIMA dei poligoni: sono più piccole e "sopra" ai fini dell'editor.
      const shaderHit = (loc.map.shaders ?? []).find((deco) => {
        const r = shaderDecorationRectPercent(deco, loc.map.grid, nw, nh);
        const c = rectCorners(r);
        return pointInPolygon(point, [c.nw, c.ne, c.se, c.sw]);
      });
      if (shaderHit) {
        draggingPolygon = null;
        s.select({ polygon: null, shader: shaderHit.id });
        draggingShader = { locationId: loc.id, id: shaderHit.id, startBase: point, originalX: shaderHit.x, originalY: shaderHit.y };
        return;
      }

      const hit = (loc.map.polygons ?? []).find((poly) => pointInPolygon(point, poly.points));
      draggingShader = null;
      s.select({ polygon: hit ? hit.id : null, shader: null });
      draggingPolygon = hit
        ? { locationId: loc.id, polygonId: hit.id, startBase: point, originalPoints: hit.points.map((p) => [...p] as Point) }
        : null;
    };

    // Ultima posizione del puntatore e flag anti-rientranza: servono a riapplicare il drag in corso
    // quando arriva uno `state:update` remoto (che sostituisce lo stato e farebbe scattare indietro
    // la posizione fino al pointermove successivo).
    let lastPointer: { clientX: number; clientY: number } | null = null;
    let applying = false;

    const onMove = (e: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
      lastPointer = { clientX: e.clientX, clientY: e.clientY };
      applying = true;
      try {
        handleMove(e);
      } finally {
        applying = false;
      }
    };

    const handleMove = (e: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
      if (gridAlignDrag) {
        const cur = basePoint(e.clientX, e.clientY);
        placeBox(gridAlignDrag.box, gridAlignDrag.start, cur, store().gridSquareConstrain);
        gridAlignDrag.end = cur;
        return;
      }
      if (shaderPlaceDrag) {
        const cur = basePoint(e.clientX, e.clientY);
        placeBox(shaderPlaceDrag.box, shaderPlaceDrag.start, cur, false);
        shaderPlaceDrag.end = cur;
        return;
      }
      const s = store();
      if (dragState.vertexIndex !== null && s.selectedPolygonId) {
        const index = dragState.vertexIndex;
        const id = s.selectedPolygonId;
        const p = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const poly = loc.map.polygons.find((x) => x.id === id);
          if (poly) poly.points[index] = p;
        });
        return;
      }
      if (draggingPolygon) {
        const d = draggingPolygon;
        const cur = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const poly = loc.map.polygons.find((x) => x.id === d.polygonId);
          if (poly) poly.points = translatePolygon(d.originalPoints, cur[0] - d.startBase[0], cur[1] - d.startBase[1]);
        });
      }
      if (draggingShader) {
        const d = draggingShader;
        const cur = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const deco = loc.map.shaders.find((x) => x.id === d.id);
          if (!deco) return;
          deco.x = clamp(d.originalX + (cur[0] - d.startBase[0]), 0, 100);
          deco.y = clamp(d.originalY + (cur[1] - d.startBase[1]), 0, 100);
        });
      }
      if (dragState.shaderResize) {
        const r = dragState.shaderResize;
        const cur = basePoint(e.clientX, e.clientY);
        const { w: nw, h: nh } = natural();
        s.mutateLocation((loc) => {
          const deco = loc.map.shaders.find((x) => x.id === r.id);
          if (!deco) return;
          const p = resizeFromFixedCorner([r.fixedX, r.fixedY], cur, nw, nh, aoePixelsPerMeter(loc.map.grid));
          deco.x = p.x;
          deco.y = p.y;
          deco.widthM = p.widthM;
          deco.heightM = p.heightM;
        });
      }
    };

    const onUp = () => {
      lastPointer = null;
      const s = store();
      if (gridAlignDrag) {
        const { start, end, box } = gridAlignDrag;
        box.remove();
        gridAlignDrag = null;
        const { w, h } = natural();
        if (end && w) applyGridAlignment(start, end, w, h);
        s.finishTool();
        return;
      }
      if (shaderPlaceDrag) {
        const { start, end, box } = shaderPlaceDrag;
        box.remove();
        shaderPlaceDrag = null;
        const { w, h } = natural();
        if (end) applyShaderPlacement(start, end, w, h);
        s.finishTool();
        return;
      }

      const loc = selectActiveLocation(s);

      if (dragState.vertexIndex !== null) {
        const hadSelection = s.selectedPolygonId;
        dragState.vertexIndex = null;
        const poly = hadSelection ? loc?.map.polygons.find((p) => p.id === hadSelection) : undefined;
        if (loc && poly) socket.emit('polygon:update', { locationId: loc.id, polygonId: poly.id, points: poly.points });
      }

      if (draggingPolygon) {
        const d = draggingPolygon;
        draggingPolygon = null;
        const poly = loc?.map.polygons.find((p) => p.id === d.polygonId);
        if (loc && poly) {
          const newPoints = poly.points.map((p) => [...p] as Point);
          socket.emit('polygon:update', { locationId: loc.id, polygonId: d.polygonId, points: newPoints });
          if (polygonMoved(d.originalPoints, newPoints)) recordPolygonMove(loc.id, d.polygonId, poly.name, d.originalPoints, newPoints);
        }
      }

      if (draggingShader) {
        const d = draggingShader;
        draggingShader = null;
        const deco = loc?.map.shaders.find((x) => x.id === d.id);
        if (loc && deco) socket.emit('shader:move', { locationId: loc.id, id: deco.id, x: deco.x, y: deco.y });
      }

      if (dragState.shaderResize) {
        const r = dragState.shaderResize;
        dragState.shaderResize = null;
        const deco = loc?.map.shaders.find((x) => x.id === r.id);
        if (loc && deco) {
          socket.emit('shader:move', { locationId: loc.id, id: deco.id, x: deco.x, y: deco.y });
          socket.emit('shader:resize', { locationId: loc.id, id: deco.id, widthM: deco.widthM, heightM: deco.heightM });
        }
      }
    };

    const onCancel = () => {
      lastPointer = null;
      const s = store();
      if (gridAlignDrag) { gridAlignDrag.box.remove(); gridAlignDrag = null; s.finishTool(); }
      if (shaderPlaceDrag) { shaderPlaceDrag.box.remove(); shaderPlaceDrag = null; s.finishTool(); }
      dragState.shaderResize = null;
      dragState.vertexIndex = null;
      draggingPolygon = null;
      draggingShader = null;
    };

    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if (applying || !lastPointer || s.server === prev.server) return;
      const dragging = dragState.vertexIndex !== null || draggingPolygon || draggingShader || dragState.shaderResize;
      if (dragging) onMove(lastPointer);
    });

    overlay.addEventListener('click', onClick);
    overlay.addEventListener('pointerdown', onPointerDown);
    const onPointerMove = (e: PointerEvent) => onMove(e);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      unsubscribe();
      dragState.vertexIndex = null;
      dragState.shaderResize = null;
      overlay.removeEventListener('click', onClick);
      overlay.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, [mediaRef]);
}
