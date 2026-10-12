import { Button } from '@/components/ui/button';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { BoltIcon, PauseIcon, PlayIcon, StopIcon } from '../aoe/icons';
import { Stepper } from '../components/Stepper';
import { selectActiveLocation, useControlStore } from '../store/control-store';
import { Box, clamp, round1 } from './Box';

const AUDIO_VOLUME_STEP = 0.1;
const DEFAULT_VOLUME = 0.7;

const DISPLAY_AUDIO_LABELS = {
  playing: 'in riproduzione',
  idle: 'fermo',
  error: 'file non trovato o illeggibile',
  blocked: 'audio bloccato dal browser',
} as const;

// Box "Audio": riflette sempre la location ATTIVA (i comandi non hanno un
// concetto di anteprima). Nascosto se non c'e nessuna traccia.
export function AudioBox() {
  const location = useControlStore(selectActiveLocation);
  const activeTrack = useControlStore((s) => s.server?.activeAudioTrack ?? null);
  const playing = useControlStore((s) => s.server?.audioState === 'playing');
  const displayConnected = useControlStore((s) => s.displayConnected);
  const displayAudio = useControlStore((s) => s.server?.displayAudio ?? null);
  const audio = location?.map.audio;
  const hasMain = Boolean(audio?.main?.file);
  const hasSpecial = Boolean(audio?.special?.file);
  if (!hasMain && !hasSpecial) return null;

  const displayLabel = !displayConnected ? 'non connesso' : displayAudio ? DISPLAY_AUDIO_LABELS[displayAudio.status] : null;
  const displayProblem = displayConnected && (displayAudio?.status === 'error' || displayAudio?.status === 'blocked');

  const track = activeTrack ? audio?.[activeTrack] : undefined;
  const hasActive = Boolean(track?.file);
  const volume = track?.volume === undefined ? DEFAULT_VOLUME : track.volume;
  const step = (delta: number) =>
    socket.emit('audio:volume', { volume: clamp(round1(volume + delta), 0, 1) });

  return (
    <Box id="audio-section" title="Audio">
      {displayLabel && (
        <p
          data-testid="display-audio-status"
          className={cn('text-xs', displayProblem ? 'text-destructive' : 'text-muted-foreground')}
        >
          Display: {displayLabel}
        </p>
      )}
      {hasSpecial && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Traccia speciale</span>
          <Button
            type="button" variant="outline" size="icon" className="size-10"
            title="Fai partire la traccia speciale" aria-label="Fai partire la traccia speciale"
            onClick={() => socket.emit('audio:playSpecial', {})}
          >
            <BoltIcon />
          </Button>
        </div>
      )}
      {hasActive && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{activeTrack === 'special' ? 'Speciale' : 'Principale'}</p>
          <div className="flex items-center justify-between gap-2">
            <div className="audio-transport flex gap-2">
              <Button
                type="button" variant="outline" size="icon"
                className={cn('size-10', playing && 'active border-[color:var(--vtt-accent)]! bg-[color:var(--vtt-accent)]! text-[color:var(--accent-text)]!')}
                title="Play/Pausa" aria-label="Play/Pausa"
                onClick={() => socket.emit(playing ? 'audio:pause' : 'audio:play', {})}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <Button
                type="button" variant="outline" size="icon" className="size-10"
                title="Stop" aria-label="Stop" onClick={() => socket.emit('audio:stop', {})}
              >
                <StopIcon />
              </Button>
            </div>
            <Stepper
              value={`${Math.round(volume * 100)}%`}
              decTitle="Riduci volume" incTitle="Aumenta volume"
              onDec={() => step(-AUDIO_VOLUME_STEP)} onInc={() => step(AUDIO_VOLUME_STEP)}
            />
          </div>
        </div>
      )}
    </Box>
  );
}
