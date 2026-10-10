import { Archive, GripVertical, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { useSortableList } from '@/hooks/use-sortable-list';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';

export function LocationPanel() {
  const server = useEditorStore((s) => s.server);
  const archiveArm = useArmConfirm();
  const deleteArm = useArmConfirm();
  const active = server?.locations.filter((l) => !l.archived) ?? [];
  const archived = server?.locations.filter((l) => l.archived) ?? [];
  const byId = new Map(active.map((l) => [l.id, l]));
  const sortable = useSortableList(active.map((l) => l.id), (orderedIds) => socket.emit('location:reorder', { orderedIds }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {sortable.order.map((id) => {
          const l = byId.get(id);
          if (!l) return null;
          const armed = archiveArm.isArmed(id);
          return (
            <div key={id} ref={sortable.rowRef(id)} className={cn('flex items-center gap-1 rounded-md border p-1', sortable.isDragging && 'select-none')}>
              <span className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                <GripVertical className="size-4" />
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={cn(l.isDefault && 'text-primary')}
                title={l.isDefault ? 'Location predefinita all’avvio' : 'Imposta come predefinita all’avvio'}
                onClick={() => socket.emit('location:setDefault', { locationId: id })}
              >
                <Star className={cn(l.isDefault && 'fill-current')} />
              </Button>
              <CommitInput className="h-8" placeholder="nome location" value={l.name}
                onCommit={(name) => socket.emit('location:rename', { locationId: id, name })} />
              <Button
                variant={armed ? 'destructive' : 'ghost'}
                size="icon"
                title={armed ? 'Click di nuovo per confermare' : 'Archivia location'}
                onClick={() => archiveArm.press(id, () => socket.emit('location:archive', { locationId: id }))}
              >
                <Archive />
              </Button>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Archiviate</p>
          <div className="flex flex-col gap-1">
            {archived.map((l) => {
              const armed = deleteArm.isArmed(l.id);
              return (
                <div key={l.id} className="flex items-center gap-1 rounded-md border p-1">
                  <CommitInput className="h-8" placeholder="nome location" value={l.name}
                    onCommit={(name) => socket.emit('location:rename', { locationId: l.id, name })} />
                  <Button variant="ghost" size="icon" title="Ripristina location"
                    onClick={() => { deleteArm.disarm(); socket.emit('location:restore', { locationId: l.id }); }}>
                    <RotateCcw />
                  </Button>
                  <Button
                    variant={armed ? 'destructive' : 'ghost'}
                    size="icon"
                    title={armed ? 'Click di nuovo per confermare' : 'Elimina definitivamente'}
                    onClick={() => deleteArm.press(l.id, () => socket.emit('location:delete', { locationId: l.id }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
