import { Button } from '@/components/ui/button';
import { zoomToRect } from '../lib/local-zoom';
import { computeViewportScreenRect } from '../lib/view-math';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { Box } from './Box';

// Box "Zoom locale" (modalita zoom): lo zoom non e piu automatico
// all'ingresso, solo a comando dal pulsante.
export function ZoomBox() {
  const zoomToPlayers = () => {
    const s = useControlStore.getState();
    const location = selectPreviewLocation(s);
    const g = s.geometry;
    if (!location) return;
    const rect = computeViewportScreenRect({
      location, displayViewport: s.server?.displayViewport ?? null,
      naturalW: g.naturalW, naturalH: g.naturalH, imageRect: g.imageRect,
      previewW: g.previewW, previewH: g.previewH,
    });
    if (!rect) return;
    const z = zoomToRect(rect, g.previewW, g.previewH);
    if (z) s.setLocalZoom(z, { persist: true });
  };

  return (
    <Box id="zoom-section" title="Zoom locale">
      <p className="text-xs text-muted-foreground">Solo per te, non visibile ai giocatori.</p>
      <Button type="button" onClick={zoomToPlayers}>Zooma sull'area dei PG</Button>
    </Box>
  );
}
