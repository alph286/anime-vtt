import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { socket } from '@/lib/socket';
import { stageRefs } from '@/stage/stage-refs';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

export function Header({ menus }: { menus: React.ReactNode }) {
  const server = useEditorStore((s) => s.server);
  const location = useEditorStore(selectActiveLocation);
  const resetForLocationChange = useEditorStore((s) => s.resetForLocationChange);
  const active = server?.locations.filter((l) => !l.archived) ?? [];

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-6 py-3">
      <Select
        value={location?.id ?? ''}
        onValueChange={(id) => {
          resetForLocationChange();
          if (stageRefs.canvas) { stageRefs.canvas.scrollLeft = 0; stageRefs.canvas.scrollTop = 0; }
          socket.emit('location:set', { locationId: id });
        }}
      >
        <SelectTrigger className="h-10 w-60 font-semibold" aria-label="Location attiva">
          <SelectValue placeholder="— nessuna location —" />
        </SelectTrigger>
        <SelectContent>
          {active.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" title="Nuova location" onClick={() => socket.emit('location:create', {})}>
        <Plus />
      </Button>
      {menus}
    </header>
  );
}
