import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { Grid, Point } from '@/types';
import { gridFromAlignDrag, gridHistoryAfter } from '@/lib/grid-math';
import { OPPOSITE, placementFromDrag, rectCorners, type Corner } from '@/lib/shader-math';
import { removeVertex } from '@/lib/polygon-math';
import { dragState } from './drag-state';

const store = () => useEditorStore.getState();

export function pushGridHistory(label: string, patch: Partial<Grid>) {
  const loc = selectActiveLocation(store());
  if (!loc) return;
  const locationId = loc.id;
  const before = { ...loc.map.grid };
  const after = gridHistoryAfter(before, patch);
  store().recordHistory(
    label,
    () => socket.emit('grid:update', { locationId, ...before }),
    () => socket.emit('grid:update', { locationId, ...after })
  );
}

export function applyGridAlignment(start: Point, end: Point, nw: number, nh: number) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const result = gridFromAlignDrag(start, end, nw, nh, s.gridSquareConstrain, loc.map.grid.divisions || 1);
  if (!result) return;
  pushGridHistory('griglia ritracciata', { enabled: true, ...result });
  socket.emit('grid:update', { locationId: loc.id, enabled: true, ...result });
}

export function applyShaderPlacement(start: Point, end: Point, nw: number, nh: number) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc || !nw || !nh) return;
  const placement = placementFromDrag(start, end, nw, nh, aoePixelsPerMeter(loc.map.grid));
  socket.emit('shader:place', { locationId: loc.id, shaderId: s.selectedShaderType || 'portal', ...placement });
}

function applyPointsLocally(locationId: string, polygonId: string, points: Point[]) {
  store().mutateLocation((loc) => {
    const p = loc.map.polygons.find((x) => x.id === polygonId);
    if (p) p.points = points.map((pt) => [...pt] as Point);
  });
  const p = selectActiveLocation(store())?.map.polygons.find((x) => x.id === polygonId);
  if (p) socket.emit('polygon:update', { locationId, polygonId, points: p.points });
}

export function recordPolygonMove(locationId: string, polygonId: string, name: string, originalPoints: Point[], newPoints: Point[]) {
  store().recordHistory(
    `area "${name}" spostata`,
    () => applyPointsLocally(locationId, polygonId, originalPoints),
    () => applyPointsLocally(locationId, polygonId, newPoints)
  );
}

export function removeVertexWithHistory(polygonId: string, index: number) {
  const loc = selectActiveLocation(store());
  const poly = loc?.map.polygons.find((p) => p.id === polygonId);
  if (!loc || !poly) return;
  const after = removeVertex(poly.points, index);
  if (!after) return;
  const locationId = loc.id;
  const before = poly.points.map((p) => [...p] as Point);
  applyPointsLocally(locationId, polygonId, after);
  store().recordHistory(
    `punto rimosso da "${poly.name}"`,
    () => applyPointsLocally(locationId, polygonId, before),
    () => {
      const current = selectActiveLocation(store())?.map.polygons.find((p) => p.id === polygonId);
      if (!current) return;
      const next = current.points.filter((_, i) => i !== index);
      applyPointsLocally(locationId, polygonId, next);
    }
  );
}

export function deletePolygonWithHistory(polygonId: string) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const locationId = loc.id;
  const index = loc.map.polygons.findIndex((p) => p.id === polygonId);
  const polygon = loc.map.polygons[index];
  socket.emit('polygon:delete', { locationId, polygonId });
  s.select({ polygon: null });
  if (!polygon) return;
  const snapshot = JSON.parse(JSON.stringify(polygon));
  store().recordHistory(
    `poligono "${polygon.name}" eliminato`,
    () => socket.emit('polygon:restore', { locationId, index, polygon: snapshot }),
    () => socket.emit('polygon:delete', { locationId, polygonId: snapshot.id })
  );
}

export function deleteShaderWithHistory(shaderId: string) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const locationId = loc.id;
  const index = loc.map.shaders.findIndex((d) => d.id === shaderId);
  const shader = loc.map.shaders[index];
  socket.emit('shader:remove', { locationId, id: shaderId });
  s.select({ shader: null });
  if (!shader) return;
  const snapshot = JSON.parse(JSON.stringify(shader));
  const label = (typeof SHADER_EFFECTS !== 'undefined' && SHADER_EFFECTS[shader.shaderId]?.label) || shader.shaderId;
  store().recordHistory(
    `decorazione "${label}" eliminata`,
    () => socket.emit('shader:restore', { locationId, index, shader: snapshot }),
    () => socket.emit('shader:remove', { locationId, id: snapshot.id })
  );
}

export function startShaderResize(corner: Corner) {
  const s = store();
  const loc = selectActiveLocation(s);
  const deco = loc && s.selectedShaderId ? loc.map.shaders.find((d) => d.id === s.selectedShaderId) : undefined;
  if (!loc || !deco) return;
  const { naturalW, naturalH } = s.geometry;
  const rect = shaderDecorationRectPercent(deco, loc.map.grid, naturalW, naturalH);
  const [fixedX, fixedY] = rectCorners(rect)[OPPOSITE[corner]];
  dragState.shaderResize = { id: deco.id, locationId: loc.id, fixedX, fixedY };
}
