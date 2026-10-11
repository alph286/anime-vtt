import { computeViewportScreenRect } from '../lib/view-math';
import { selectPreviewLocation, useControlStore } from '../store/control-store';

// Riquadro giallo: quale porzione della mappa sta inquadrando la TV. Ha
// senso solo in modalita pan (e il riferimento per il trascinamento); mai
// in zoom, dove confonderebbe con l'inquadratura locale del DM. Senza
// displayViewport (nessun /display mai connesso) resta solo nascosto: non
// tocca la modalita.
export function ViewportRect() {
  const location = useControlStore(selectPreviewLocation);
  const displayViewport = useControlStore((s) => s.server?.displayViewport ?? null);
  const geometry = useControlStore((s) => s.geometry);
  const pan = useControlStore((s) => s.mode === 'pan');
  const rect = pan && location
    ? computeViewportScreenRect({ location, displayViewport, ...geometry })
    : null;
  return (
    <div
      id="viewport-rect"
      hidden={!rect}
      style={rect ? { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` } : undefined}
    />
  );
}
