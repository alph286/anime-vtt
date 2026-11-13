import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CommitInput } from '@/components/CommitInput';
import { MediaPreview } from '@/components/MediaPreview';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { handoutUsage, uploadHandoutFiles } from '@/lib/handout-library';
import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import type { HandoutLibraryItem } from '@/types';

const NO_ITEMS: HandoutLibraryItem[] = [];

// Per chi si sceglie il default: una location, oppure il globale (locationId null).
export interface HandoutTarget { locationId: string | null; label: string }

// Archivio dei media di default di /handout, sul modello dell'archivio audio.
// "Usa" imposta la voce come default del target; eliminare una voce usata
// chiede conferma elencando chi la usa.
export function HandoutLibraryDialog({ open, onOpenChange, target }: {
  open: boolean; onOpenChange: (open: boolean) => void; target: HandoutTarget;
}) {
  const server = useEditorStore((s) => s.server);
  const items = server?.handoutLibrary ?? NO_ITEMS;
  const arm = useArmConfirm();
  const [pending, setPending] = useState<{ id: string; usedIn: string[] } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  if (!server) return null;
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const current = target.locationId === null
    ? server.handout?.defaultId ?? null
    : server.locations.find((l) => l.id === target.locationId)?.handoutDefaultId ?? null;

  const choose = (id: string | null) => {
    socket.emit('handout:setDefault', { locationId: target.locationId, id });
    onOpenChange(false);
  };

  const remove = (item: HandoutLibraryItem) => {
    const usedIn = handoutUsage(server, item.id);
    if (usedIn.length > 0) {
      setPending({ id: item.id, usedIn });
      return;
    }
    arm.press(item.id, () => socket.emit('handoutLibrary:delete', { id: item.id }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPending(null); setFailed([]); } onOpenChange(o); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Archivio handout</DialogTitle>
        <DialogDescription>Scegli l'handout di default per: {target.label}</DialogDescription>
        {pending && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive p-3 text-sm" role="alert">
            <p>Usato in: {pending.usedIn.join(', ')} — verrà tolto da tutte.</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm"
                onClick={() => { socket.emit('handoutLibrary:delete', { id: pending.id }); setPending(null); }}>
                Elimina
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPending(null)}>Annulla</Button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">L'archivio è vuoto.</p>}
          {sorted.map((item) => {
            const uses = handoutUsage(server, item.id).length;
            const chosen = item.id === current;
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-md border p-2">
                <MediaPreview dir="handout" file={item.file} name={item.name} className="size-12 shrink-0 rounded object-cover" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <CommitInput className="h-8" placeholder="nome" value={item.name}
                    onCommit={(name) => socket.emit('handoutLibrary:update', { id: item.id, name })} />
                  <span className="text-xs text-muted-foreground">{uses > 0 ? `Usato in ${uses}` : 'Non usato'}</span>
                </div>
                <Button size="sm" variant={chosen ? 'default' : 'secondary'}
                  className={chosen ? 'bg-[var(--vtt-accent)] text-black hover:bg-[var(--vtt-accent)]' : undefined}
                  onClick={() => choose(item.id)}>
                  Usa
                </Button>
                <Button
                  variant={arm.isArmed(item.id) ? 'destructive' : 'ghost'}
                  size="icon"
                  title={arm.isArmed(item.id) ? 'Click di nuovo per confermare' : "Elimina dall'archivio"}
                  onClick={() => remove(item)}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => choose(null)}>Nessuno</Button>
          <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
            Carica
            <input type="file" accept="image/*,video/*" multiple hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void uploadHandoutFiles(files).then(setFailed);
              }} />
          </label>
        </div>
        {failed.length > 0 && (
          <p className="text-sm text-destructive" role="alert">Caricamento non riuscito: {failed.join(', ')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
