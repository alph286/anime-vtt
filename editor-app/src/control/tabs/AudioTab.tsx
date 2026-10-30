import { socket } from '@/lib/socket';
import { audioIcon } from '@/lib/audio-icons';
import { cn } from '@/lib/utils';
import { Stepper } from '../components/Stepper';
import { clamp, round1 } from '../boxes/Box';
import { selectActiveLocation, useControlStore } from '../store/control-store';

const AUDIO_VOLUME_STEP = 0.1;
const ACTIVE = 'active border-[color:var(--vtt-accent)]! bg-[color:var(--vtt-accent)]! text-[color:var(--accent-text)]!';

const NO_ONESHOTS: Record<string, number> = {};

interface Item { id: string; name: string; icon: string; volume: number }

// Scheda Audio: righe Background (loop, piu accesi insieme) e One-shot della
// location ATTIVA (i comandi audio non hanno un concetto di anteprima).
export default function AudioTab() {
  const location = useControlStore(selectActiveLocation);
  const displayConnected = useControlStore((s) => s.displayConnected);
  const displayAudio = useControlStore((s) => s.server?.displayAudio ?? null);
  const oneshotsOn = useControlStore((s) => s.server?.audioOneshots ?? NO_ONESHOTS);

  const background = location?.map.audio?.background ?? [];
  const oneshot = location?.map.audio?.oneshot ?? [];
  const errors = displayAudio?.errors ?? [];

  const status = !displayConnected
    ? 'non connesso'
    : displayAudio?.blocked
      ? 'audio bloccato dal browser'
      : displayAudio && displayAudio.playing.length > 0
        ? 'in riproduzione'
        : 'fermo';
  const statusProblem = displayConnected && Boolean(displayAudio?.blocked);

  const item = (it: Item, on: boolean, disabled: boolean) => {
    const Icon = audioIcon(it.icon);
    const error = errors.includes(it.id);
    const volume = it.volume;
    const step = (delta: number) => {
      if (!location) return;
      socket.emit('audio:volume', { locationId: location.id, trackId: it.id, volume: clamp(round1(volume + delta), 0, 1) });
    };
    return (
      <div key={it.id} className="flex items-start gap-1.5">
        <button
          type="button"
          disabled={disabled}
          title={disabled ? 'display non connesso' : error ? 'file non trovato o illeggibile' : undefined}
          className={cn(
            'flex size-[84px] flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-1 disabled:opacity-40',
            on && ACTIVE,
            error && 'border-destructive',
          )}
          onClick={() => socket.emit('audio:toggle', { trackId: it.id })}
        >
          <Icon className="size-8" />
          <span className="w-full truncate text-center text-[11px] leading-snug">{it.name}</span>
        </button>
        <Stepper
          vertical
          value={`${Math.round(volume * 100)}%`}
          decTitle="Riduci volume" incTitle="Aumenta volume"
          onDec={() => step(-AUDIO_VOLUME_STEP)} onInc={() => step(AUDIO_VOLUME_STEP)}
        />
      </div>
    );
  };

  return (
    <div data-testid="audio-tab" className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold">Audio di: {location?.name ?? '—'}</h2>
      <p
        data-testid="display-audio-status"
        className={cn('text-xs', statusProblem ? 'text-destructive' : 'text-muted-foreground')}
      >
        Display: {status}
      </p>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background</h3>
        <div className="flex flex-wrap gap-2.5">
          {background.length === 0 && (
            <p className="text-xs text-muted-foreground">nessun audio di background per questa location — si caricano da /editor</p>
          )}
          {background.map((t) => item(t, t.on, false))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">One-shot</h3>
        <div className="flex flex-wrap gap-2.5">
          {oneshot.length === 0 && (
            <p className="text-xs text-muted-foreground">nessun one-shot per questa location — si caricano da /editor</p>
          )}
          {oneshot.map((t) => item(t, Boolean(oneshotsOn[t.id]), !displayConnected))}
        </div>
      </section>
    </div>
  );
}
