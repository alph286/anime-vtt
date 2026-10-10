import { ArrowDownAZ, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useSortableList } from '@/hooks/use-sortable-list';
import { sortPolygonIdsByName } from '@/lib/polygon-math';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

export function FogPanel() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedPolygonId);
  const polygons = location?.map.polygons ?? [];
  const byId = new Map(polygons.map((p) => [p.id, p]));
  const sortable = useSortableList(
    polygons.map((p) => p.id),
    (orderedIds) => location && socket.emit('polygon:reorder', { locationId: location.id, orderedIds })
  );

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          title="Ordina alfabeticamente"
          disabled={!location}
          onClick={() => location && socket.emit('polygon:reorder', { locationId: location.id, orderedIds: sortPolygonIdsByName(polygons) })}
        >
          <ArrowDownAZ />
        </Button>
      </div>
      {polygons.length === 0 && <p className="text-sm text-muted-foreground">Nessuna area di fog su questa location.</p>}
      <div className="flex flex-col gap-1">
        {sortable.order.map((id) => {
          const poly = byId.get(id);
          if (!poly || !location) return null;
          return (
            <div
              key={id}
              ref={sortable.rowRef(id)}
              className={cn(
                'flex items-center gap-1 rounded-md border p-1',
                id === selectedId && 'border-primary bg-primary/10',
                sortable.isDragging && 'select-none'
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('input, button, [data-drag]')) return;
                useEditorStore.getState().setMode('select');
                useEditorStore.getState().select({ polygon: id });
              }}
            >
              <span data-drag className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                <GripVertical className="size-4" />
              </span>
              <CommitInput
                className="h-8"
                value={poly.name}
                onCommit={(name) => socket.emit('polygon:update', { locationId: location.id, polygonId: id, name })}
              />
              <Button
                variant="ghost"
                size="icon"
                title={poly.revealed ? 'Rivelata — clic per nascondere' : 'Nascosta — clic per rivelare'}
                onClick={() => socket.emit('fow:toggle', { locationId: location.id, polygonId: id })}
              >
                {poly.revealed ? <Eye /> : <EyeOff />}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
