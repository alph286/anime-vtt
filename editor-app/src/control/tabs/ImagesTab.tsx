import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { MediaPreview } from '@/components/MediaPreview';
import { Label } from '@/components/ui/label';
import { useTelegramDestinations } from '@/hooks/use-telegram-destinations';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectActiveLocation, useControlStore } from '../store/control-store';

// Scheda Media (immagini e video): miniature della location ATTIVA (non quella in anteprima);
// toccandone una si apre il dettaglio (didascalia, destinazione Telegram,
// Mostra / Invia / Ritorna alla mappa).
export default function ImagesTab() {
  const location = useControlStore(selectActiveLocation);
  const activeLocationId = useControlStore((s) => s.server?.activeLocationId ?? null);
  const activeImageId = useControlStore((s) => s.server?.activeImageId ?? null);
  const previewImageId = useControlStore((s) => s.previewImageId);
  const setPreviewImage = useControlStore((s) => s.setPreviewImage);
  const pending = useControlStore((s) => s.telegramPending);
  const feedback = useControlStore((s) => s.telegramFeedback);
  const destinations = useTelegramDestinations();

  const images = location?.images ?? [];
  const image = images.find((i) => i.id === previewImageId);
  const unavailable = destinations !== null && destinations.length === 0;

  return (
    <div data-testid="images-tab" className="flex flex-col gap-3 p-3">
      <div id="images-list" className="thumb-row flex flex-wrap gap-2.5">
        {images.length === 0 && (
          <p className="text-xs text-muted-foreground">nessun media per questa location</p>
        )}
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            className={cn(
              'image-thumb relative size-[84px] overflow-hidden rounded-lg border border-border bg-card p-0',
              activeImageId === img.id && 'active border-2 border-[var(--vtt-accent)]',
              previewImageId === img.id && 'selected ring-2 ring-foreground',
            )}
            onClick={() => setPreviewImage(img.id)}
          >
            <MediaPreview file={img.file} name={img.name} className="block size-full object-cover" />
            <span className="image-thumb-label absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[11px] leading-snug text-white">
              {img.name}
            </span>
          </button>
        ))}
      </div>

      {image && (
        <section id="image-detail" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <MediaPreview
            file={image.file}
            name={image.name}
            playing
            className="block max-h-[220px] w-full rounded-lg bg-background object-contain"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="image-caption-input" className="text-xs text-muted-foreground">Didascalia</Label>
            <CommitInput
              key={image.id}
              id="image-caption-input"
              className="h-10"
              placeholder="didascalia per Telegram"
              value={image.caption ?? ''}
              onCommit={(caption) => {
                if (!activeLocationId) return;
                socket.emit('image:caption', { locationId: activeLocationId, imageId: image.id, caption });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="image-destination-select" className="text-xs text-muted-foreground">Destinazione Telegram</Label>
            <select
              id="image-destination-select"
              className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
              disabled={destinations === null || unavailable}
              value={image.telegramDestination ?? ''}
              onChange={(e) => {
                if (!activeLocationId) return;
                socket.emit('image:destination', {
                  locationId: activeLocationId, imageId: image.id, destination: e.target.value || null,
                });
              }}
            >
              {destinations === null && <option value="">Caricamento…</option>}
              {unavailable && <option value="">Destinazioni non disponibili</option>}
              {destinations && destinations.length > 0 && (
                <>
                  <option value="">— scegli destinazione —</option>
                  {destinations.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </>
              )}
            </select>
          </div>
          <div className="image-detail-actions flex flex-wrap gap-2">
            <Button
              type="button" variant="outline" className={cn('h-11 min-w-[100px] flex-1', activeImageId === image.id && 'is-live border-[color:var(--vtt-accent)]! bg-[color:var(--accent-bg-subtle)]! text-[color:var(--vtt-accent)]!')}
              onClick={() => socket.emit('image:show', { imageId: image.id })}
            >
              Mostra
            </Button>
            <Button
              type="button" variant="outline" className="h-11 min-w-[100px] flex-1"
              disabled={!image.telegramDestination || pending}
              onClick={() => {
                if (!image.telegramDestination || pending || !activeLocationId) return;
                useControlStore.getState().setTelegram({ pending: true, feedback: null });
                socket.emit('image:sendTelegram', { locationId: activeLocationId, imageId: image.id });
              }}
            >
              {pending ? 'Invio…' : 'Invia'}
            </Button>
            <Button
              type="button" className="h-11 min-w-[100px] flex-1"
              disabled={!activeImageId}
              onClick={() => socket.emit('image:hide')}
            >
              Ritorna alla mappa
            </Button>
          </div>
          {feedback && feedback.imageId === image.id && (
            <p className={cn('image-send-feedback text-sm text-[var(--vtt-accent)]', !feedback.ok && 'error text-destructive')}>
              {feedback.ok ? 'Inviata ✓' : (feedback.error || 'Invio fallito')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
