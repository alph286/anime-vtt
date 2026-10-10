import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { dragState } from './drag-state';
import { removeVertexWithHistory } from './actions';

export function PolygonLayer() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedPolygonId);
  const fogOpacity = useEditorStore((s) => s.fogOpacity);
  const drawing = useEditorStore((s) => s.drawing);
  const rect = useEditorStore((s) => s.geometry.imageRect);
  const polygons = location?.map.polygons ?? [];
  const px = (pct: number, size: number) => `${(pct / 100) * size}px`;

  return (
    <>
      <svg id="polygon-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {polygons.map((poly) => {
          const isSelected = poly.id === selectedId;
          return (
            <polygon
              key={poly.id}
              points={poly.points.map(([x, y]) => `${x},${y}`).join(' ')}
              className={cn('fog-poly', poly.revealed && 'revealed', isSelected && 'selected')}
              style={!poly.revealed && !isSelected ? { fillOpacity: fogOpacity } : undefined}
            />
          );
        })}
        {drawing.points.length > 0 && (
          <polyline className="draw-line" points={drawing.points.map(([x, y]) => `${x},${y}`).join(' ')} />
        )}
      </svg>
      {rect &&
        polygons
          .filter((p) => p.id === selectedId)
          .flatMap((poly) =>
            poly.points.map(([x, y], index) => (
              <div
                key={`${poly.id}-${index}`}
                className="vertex-handle"
                style={{ left: px(x, rect.width), top: px(y, rect.height) }}
                onPointerDown={(e) => { e.stopPropagation(); dragState.vertexIndex = index; }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeVertexWithHistory(poly.id, index); }}
              />
            ))
          )}
      {rect &&
        drawing.points.map(([x, y], i) => (
          <div key={`d${i}`} className="draw-point" style={{ left: px(x, rect.width), top: px(y, rect.height) }} />
        ))}
    </>
  );
}
