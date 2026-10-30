import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { audioUsage, uploadAudioFiles } from '@/lib/audio-library';
import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import type { AudioLibraryItem } from '@/types';
import { AudioIconPicker } from './AudioIconPicker';

const NO_ITEMS: AudioLibraryItem[] = [];

// Archivio audio del progetto: nome e icona valgono in tutte le location che usano
// la voce. Eliminare una voce usata chiede conferma elencando le location.
export function AudioLibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const server = useEditorStore((s) => s.server);
  const items = server?.audioLibrary ?? NO_ITEMS;
  const arm = useArmConfirm();
  const [pending, setPending] = useState<{ id: string; usedIn: string[] } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  if (!server) return null;
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const remove = (item: AudioLibraryItem) => {
    const usedIn = audioUsage(server, item.id);
    if (usedIn.length > 0) {
      setPending({ id: item.id, usedIn });
      return;
    }
    arm.press(item.id, () => socket.emit('audioLibrary:delete', { audioId: item.id }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPending(null); onOpenChange(o); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Archivio audio</DialogTitle>
        <DialogDescription>Nome e icona valgono in tutte le location che usano l'audio.</DialogDescription>
        {pending && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive p-3 text-sm" role="alert">
            <p>Usato in: {pending.usedIn.join(', ')} — verrà tolto da tutte le location.</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm"
                onClick={() => { socket.emit('audioLibrary:delete', { audioId: pending.id }); setPending(null); }}>
                Elimina
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPending(null)}>Annulla</Button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">L'archivio è vuoto.</p>}
          {sorted.map((item) => {
            const uses = audioUsage(server, item.id).length;
            return (
              <div key={item.id} className="flex items-center gap-1 rounded-md border p-2">
                <AudioIconPicker value={item.icon}
                  onPick={(icon) => socket.emit('audioLibrary:update', { audioId: item.id, icon })} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <CommitInput className="h-8" placeholder="nome" value={item.name}
                    onCommit={(name) => socket.emit('audioLibrary:update', { audioId: item.id, name })} />
                  <span className="text-xs text-muted-foreground">{uses > 0 ? `Usato in ${uses} location` : 'Non usato'}</span>
                </div>
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
        <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
          Carica audio
          <input type="file" accept="audio/*" multiple hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void uploadAudioFiles(files).then(setFailed);
            }} />
        </label>
        {failed.length > 0 && (
          <p className="text-sm text-destructive" role="alert">Caricamento non riuscito: {failed.join(', ')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
