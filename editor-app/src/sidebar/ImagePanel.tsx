import { useState } from 'react';
import { GripVertical, Maximize2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CommitInput } from '@/components/CommitInput';
import { MediaPreview } from '@/components/MediaPreview';
import { checkVideoSafe } from '@/lib/video-check';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { useSortableList } from '@/hooks/use-sortable-list';
import { useTelegramDestinations } from '@/hooks/use-telegram-destinations';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { ImageItem } from '@/types';
import { AddWebDialog } from './AddWebDialog';
import { Lightbox } from './Lightbox';

const NONE = '__none__';

export function ImagePanel() {
  const location = useEditorStore(selectActiveLocation);
  const destinations = useTelegramDestinations();
  const arm = useArmConfirm();
  const [preview, setPreview] = useState<ImageItem | null>(null);
  const images = location?.images ?? [];
  const byId = new Map(images.map((i) => [i.id, i]));
  const sortable = useSortableList(images.map((i) => i.id), (orderedIds) =>
    location && socket.emit('image:reorder', { locationId: location.id, orderedIds })
  );
  const destinationsUnavailable = destinations === null || destinations.length === 0;

  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva — creane una qui sopra.</p>;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const { setUploadWarning } = useEditorStore.getState();
    setUploadWarning(null);
    if (isVideoFile(file.name)) {
      const check = await checkVideoSafe(file);
      if (!check.ok) {
        setUploadWarning(`Upload bloccato: ${check.reason}`);
        return;
      }
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    formData.append('name', file.name);
    await fetch('/api/upload/image', { method: 'POST', body: formData });
  };

  return (
    <div className="flex flex-col gap-3">
      {images.length === 0 && <p className="text-sm text-muted-foreground">Nessun media per questa location.</p>}
      <div className="flex flex-col gap-2">
        {sortable.order.map((id) => {
          const img = byId.get(id);
          if (!img) return null;
          const armed = arm.isArmed(id);
          return (
            <div key={id} ref={sortable.rowRef(id)} className={cn('flex flex-col gap-1 rounded-md border p-2', sortable.isDragging && 'select-none')}>
              <div className="flex items-center gap-1">
                <span className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                  <GripVertical className="size-4" />
                </span>
                <button type="button" className="relative size-12 shrink-0 overflow-hidden rounded" title="Anteprima a schermo intero" onClick={() => setPreview(img)}>
                  <MediaPreview file={img.file} url={img.url} proxy={img.proxy} name={img.name} className="size-full object-cover" />
                  <Maximize2 className="absolute right-0.5 bottom-0.5 size-3 text-white drop-shadow" />
                </button>
                <CommitInput className="h-8" placeholder="etichetta" value={img.name}
                  onCommit={(name) => socket.emit('image:rename', { locationId: location.id, imageId: id, name })} />
                <Button
                  variant={armed ? 'destructive' : 'ghost'}
                  size="icon"
                  title={armed ? 'Click di nuovo per confermare' : 'Elimina media'}
                  onClick={() => arm.press(id, () => socket.emit('image:delete', { locationId: location.id, imageId: id }))}
                >
                  <Trash2 />
                </Button>
              </div>
              {!img.url && <div className="flex gap-1">
                <CommitInput className="h-8" placeholder="didascalia per Telegram" value={img.caption || ''}
                  onCommit={(caption) => socket.emit('image:caption', { locationId: location.id, imageId: id, caption })} />
                <Select
                  disabled={destinationsUnavailable}
                  value={img.telegramDestination || NONE}
                  onValueChange={(v) => socket.emit('image:destination', { locationId: location.id, imageId: id, destination: v === NONE ? null : v })}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={destinations === null ? 'Caricamento…' : 'Destinazioni non disponibili'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— scegli destinazione —</SelectItem>
                    {(destinations ?? []).map((d) => (
                      <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
          Carica media
          <input type="file" accept="image/*,video/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <AddWebDialog locationId={location.id} />
      </div>
      <Lightbox image={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
