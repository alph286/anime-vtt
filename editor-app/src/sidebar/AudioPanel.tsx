import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

type Slot = 'main' | 'special';

function AudioSlot({ slot, uploadLabel }: { slot: Slot; uploadLabel: string }) {
  const location = useEditorStore(selectActiveLocation);
  const arm = useArmConfirm();
  if (!location) return null;
  const track = location.map.audio[slot];
  const hasFile = Boolean(track?.file);
  const key = `${location.id}:${track?.file}`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    formData.append('name', file.name);
    formData.append('slot', slot);
    await fetch('/api/upload/audio', { method: 'POST', body: formData });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      {hasFile && track && (
        <div className="flex items-center gap-1">
          <CommitInput className="h-8" placeholder="etichetta" value={track.name}
            onCommit={(name) => socket.emit('audio:rename', { locationId: location.id, slot, name })} />
          <Button
            variant={arm.isArmed(key) ? 'destructive' : 'ghost'}
            size="icon"
            title={arm.isArmed(key) ? 'Click di nuovo per confermare' : 'Elimina traccia'}
            onClick={() => arm.press(key, () => socket.emit('audio:delete', { locationId: location.id, slot }))}
          >
            <Trash2 />
          </Button>
        </div>
      )}
      <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
        {hasFile ? 'Sostituisci traccia' : uploadLabel}
        <input type="file" accept="audio/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </div>
  );
}

export function AudioPanel() {
  const location = useEditorStore(selectActiveLocation);
  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva.</p>;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Traccia principale</h3>
        <AudioSlot slot="main" uploadLabel="Carica traccia principale" />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Traccia speciale</h3>
        <AudioSlot slot="special" uploadLabel="Carica traccia speciale" />
      </section>
    </div>
  );
}
