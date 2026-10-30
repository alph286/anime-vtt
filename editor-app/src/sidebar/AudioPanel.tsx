import { useState } from 'react';
import { Archive, Copy, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { audioIcon } from '@/lib/audio-icons';
import { uploadAudioFiles } from '@/lib/audio-library';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { AudioKind, AudioLibraryItem, BackgroundTrack, OneshotTrack } from '@/types';
import { AudioIconPicker } from './AudioIconPicker';
import { AudioLibraryDialog } from './AudioLibraryDialog';

type Track = BackgroundTrack | OneshotTrack;
const NO_ITEMS: AudioLibraryItem[] = [];

function TrackRow({ locationId, kind, track }: { locationId: string; kind: AudioKind; track: Track }) {
  const arm = useArmConfirm();
  const key = `${locationId}:${track.id}`;
  const restartId = `restart-${track.id}`;
  const handoutId = `handout-${track.id}`;
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex items-center gap-1">
        <AudioIconPicker value={track.icon}
          onPick={(icon) => socket.emit('audioLibrary:update', { audioId: track.audioId, icon })} />
        <CommitInput className="h-8" placeholder="nome" value={track.name}
          onCommit={(name) => socket.emit('audioLibrary:update', { audioId: track.audioId, name })} />
        <Button
          variant={arm.isArmed(key) ? 'destructive' : 'ghost'}
          size="icon"
          title={arm.isArmed(key) ? 'Click di nuovo per confermare' : 'Togli da questa location'}
          onClick={() => arm.press(key, () => socket.emit('audio:delete', { locationId, trackId: track.id }))}
        >
          <Trash2 />
        </Button>
      </div>
      {kind === 'background' && (
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id={restartId}
            checked={(track as BackgroundTrack).restartOnStop}
            onCheckedChange={(v) => socket.emit('audio:update', { locationId, trackId: track.id, restartOnStop: v === true })}
          />
          <label htmlFor={restartId}>Riparti dall'inizio quando lo spegni</label>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id={handoutId}
          checked={track.handout}
          onCheckedChange={(v) => socket.emit('audio:update', { locationId, trackId: track.id, handout: v === true })}
        />
        <label htmlFor={handoutId}>Suona anche su /handout</label>
      </div>
    </div>
  );
}

// Sceglie dall'archivio (più voci in fila: la lista resta aperta) o carica un
// file nuovo, che finisce nell'archivio e subito in questa riga.
function AddFromLibrary({ locationId, kind }: { locationId: string; kind: AudioKind }) {
  const items = useEditorStore((s) => s.server?.audioLibrary ?? NO_ITEMS);
  const [failed, setFailed] = useState<string[]>([]);
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" className="w-fit"><Plus /> Aggiungi</Button>
        </PopoverTrigger>
        <PopoverContent className="flex max-h-80 w-64 flex-col gap-1 overflow-y-auto p-2">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">L'archivio è vuoto.</p>}
          {sorted.map((item) => {
            const Icon = audioIcon(item.icon);
            return (
              <Button key={item.id} variant="ghost" className="justify-start"
                onClick={() => socket.emit('audio:add', { locationId, kind, audioId: item.id })}>
                <Icon /> {item.name}
              </Button>
            );
          })}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border-t px-3 py-2 text-sm hover:bg-accent">
            <Upload className="size-4" /> Carica nuovo…
            <input type="file" accept="audio/*" multiple hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void uploadAudioFiles(files, { locationId, kind }).then(setFailed);
              }} />
          </label>
        </PopoverContent>
      </Popover>
      {failed.length > 0 && (
        <p className="text-sm text-destructive" role="alert">Caricamento non riuscito: {failed.join(', ')}</p>
      )}
    </>
  );
}

function AudioSection({ kind, title }: { kind: AudioKind; title: string }) {
  const location = useEditorStore(selectActiveLocation);
  if (!location) return null;
  const tracks: Track[] = location.map.audio[kind];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {tracks.map((t) => <TrackRow key={t.id} locationId={location.id} kind={kind} track={t} />)}
      <AddFromLibrary locationId={location.id} kind={kind} />
    </section>
  );
}

// Aggiunge in coda tutte le righe audio di un'altra location (il server salta
// gli audio già presenti nella stessa riga).
function CopyFromLocation({ locationId }: { locationId: string }) {
  const locations = useEditorStore((s) => s.server?.locations);
  const [open, setOpen] = useState(false);
  const sources = (locations ?? []).filter((l) =>
    l.id !== locationId && l.map.audio.background.length + l.map.audio.oneshot.length > 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" disabled={sources.length === 0}><Copy /> Copia audio da…</Button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-80 w-64 flex-col gap-1 overflow-y-auto p-2">
        {sources.map((l) => (
          <Button key={l.id} variant="ghost" className="justify-start"
            onClick={() => { socket.emit('audio:copyFrom', { locationId, fromLocationId: l.id }); setOpen(false); }}>
            {l.name}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AudioPanel() {
  const location = useEditorStore(selectActiveLocation);
  const [libraryOpen, setLibraryOpen] = useState(false);
  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setLibraryOpen(true)}><Archive /> Archivio</Button>
        <CopyFromLocation locationId={location.id} />
      </div>
      <p className="text-xs text-muted-foreground">Nome e icona valgono in tutte le location</p>
      <AudioSection kind="background" title="Background" />
      <AudioSection kind="oneshot" title="One-shot" />
      <AudioLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
    </div>
  );
}
