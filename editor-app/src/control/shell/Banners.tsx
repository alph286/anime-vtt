import { Button } from '@/components/ui/button';
import { socket } from '@/lib/socket';
import {
  selectIsPreviewing, selectActiveLocation, selectPreviewLocation, useControlStore,
} from '../store/control-store';

const bannerBase = 'mx-3.5 mt-3 shrink-0 rounded-[10px] border px-3 py-2.5 text-[13px] min-[700px]:mx-0 min-[700px]:rounded-xl';

// Anteprima di una location non ancora mandata ai giocatori.
function PreviewBanner() {
  const previewing = useControlStore(selectIsPreviewing);
  const preview = useControlStore(selectPreviewLocation);
  const cancelPreview = useControlStore((s) => s.cancelPreview);
  if (!previewing || !preview) return null;
  return (
    <div
      data-testid="preview-banner"
      className={`${bannerBase} flex flex-wrap items-center gap-2 border-border bg-card text-muted-foreground`}
    >
      <span>
        Anteprima: <strong className="text-foreground">{preview.name}</strong> — non visibile ai giocatori
      </span>
      <Button size="sm" onClick={() => socket.emit('location:set', { locationId: preview.id })}>
        Invia al display
      </Button>
      <Button size="sm" variant="secondary" onClick={cancelPreview}>Annulla anteprima</Button>
    </div>
  );
}

// Un'immagine e in onda al posto della mappa.
function ShowingBanner() {
  const location = useControlStore(selectActiveLocation);
  const activeImageId = useControlStore((s) => s.server?.activeImageId);
  const image = (location?.images ?? []).find((i) => i.id === activeImageId);
  if (!activeImageId || !image) return null;
  return (
    <div
      data-testid="showing-banner"
      className={`${bannerBase} flex items-center gap-2 border-primary bg-[var(--accent-bg-subtle)] text-primary`}
    >
      <span className="size-2 shrink-0 rounded-full bg-primary" />
      <span>Stai mostrando <strong>{image.name || ''}</strong> ai giocatori</span>
    </div>
  );
}

export function Banners() {
  return (
    <>
      <PreviewBanner />
      <ShowingBanner />
    </>
  );
}
