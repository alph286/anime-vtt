import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { AUDIO_ICONS, audioIcon } from '@/lib/audio-icons';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { AudioKind, BackgroundTrack, OneshotTrack } from '@/types';

type Track = BackgroundTrack | OneshotTrack;

function IconPicker({ locationId, track }: { locationId: string; track: Track }) {
  const [open, setOpen] = useState(false);
  const Icon = audioIcon(track.icon);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon" title="Scegli icona"><Icon /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="grid grid-cols-6 gap-1">
          {AUDIO_ICONS.map(({ slug, label, Icon: I }) => (
            <Button
              key={slug}
              size="icon"
              variant={slug === track.icon ? 'default' : 'ghost'}
              title={label}
              onClick={() => {
                socket.emit('audio:update', { locationId, trackId: track.id, icon: slug });
                setOpen(false);
              }}
            >
              <I />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TrackRow({ locationId, kind, track }: { locationId: string; kind: AudioKind; track: Track }) {
  const arm = useArmConfirm();
  const key = `${locationId}:${track.id}`;
  const restartId = `restart-${track.id}`;
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex items-center gap-1">
        <IconPicker locationId={locationId} track={track} />
        <CommitInput className="h-8" placeholder="nome" value={track.name}
          onCommit={(name) => socket.emit('audio:update', { locationId, trackId: track.id, name })} />
        <Button
          variant={arm.isArmed(key) ? 'destructive' : 'ghost'}
          size="icon"
          title={arm.isArmed(key) ? 'Click di nuovo per confermare' : 'Elimina traccia'}
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
    </div>
  );
}

function AudioSection({ kind, title }: { kind: AudioKind; title: string }) {
  const location = useEditorStore(selectActiveLocation);
  const [failed, setFailed] = useState<string[]>([]);
  if (!location) return null;
  const tracks: Track[] = location.map.audio[kind];

  // Un upload per file, in sequenza: un file rifiutato non ferma gli altri.
  const upload = async (files: File[]) => {
    const errors: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append('locationId', location.id);
      formData.append('kind', kind);
      formData.append('name', file.name.replace(/\.[^.]+$/, ''));
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload/audio', { method: 'POST', body: formData });
        if (!res.ok) errors.push(file.name);
      } catch {
        errors.push(file.name);
      }
    }
    setFailed(errors);
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {tracks.map((t) => <TrackRow key={t.id} locationId={location.id} kind={kind} track={t} />)}
      <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
        Aggiungi audio
        <input type="file" accept="audio/*" multiple hidden
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void upload(files); }} />
      </label>
      {failed.length > 0 && (
        <p className="text-sm text-destructive" role="alert">Caricamento non riuscito: {failed.join(', ')}</p>
      )}
    </section>
  );
}

export function AudioPanel() {
  const location = useEditorStore(selectActiveLocation);
  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva.</p>;
  return (
    <div className="flex flex-col gap-4">
      <AudioSection kind="background" title="Background" />
      <AudioSection kind="oneshot" title="One-shot" />
    </div>
  );
}
