import { Eye, EyeOff } from 'lucide-react';
import { socket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Stepper } from '../components/Stepper';
import {
  selectIsPreviewing, selectPreviewLocation, selectShowingImage, useControlStore,
} from '../store/control-store';
import { Box, clamp, round1 } from './Box';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.2;
const GRID_OPACITY_STEP = 0.1;

// [dx, dy] come i data-pan di index.html (la direzione del contenuto, non
// del riquadro: ▲ = 0,1).
const PAD: (string | null)[][] = [
  [null, '▲', null], ['◀', null, '▶'], [null, '▼', null],
];
const PAD_DIR: Record<string, [number, number]> = { '▲': [0, 1], '◀': [1, 0], '▶': [-1, 0], '▼': [0, -1] };

// Box "Controlli" (modalita pan): pad di movimento, zoom condiviso, opacita
// griglia giocatori/DM e visibilita griglia solo-DM. Nascosto quando si
// mostra un'immagine al posto della mappa (control.js:1018-1020).
export function PanBox() {
  const location = useControlStore(selectPreviewLocation);
  const previewLocationId = useControlStore((s) => s.previewLocationId);
  const showingImage = useControlStore(selectShowingImage);
  const isPreviewing = useControlStore(selectIsPreviewing);
  const dmGridOpacity = useControlStore((s) => s.dmGridOpacity);
  const dmGridVisible = useControlStore((s) => s.dmGridVisible);
  const setDmGridOpacity = useControlStore((s) => s.setDmGridOpacity);
  const toggleDmGridVisible = useControlStore((s) => s.toggleDmGridVisible);

  if (showingImage && !isPreviewing) return null;

  const scale = location?.map.liveView?.scale || 1;
  const grid = location?.map.grid;
  const gridOn = Boolean(grid?.enabled);
  const playersOpacity = grid?.opacity === undefined ? 1 : grid.opacity;

  const pan = (dir: string) => {
    const [dx, dy] = PAD_DIR[dir];
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { locationId: previewLocationId, dx: dx * step, dy: dy * step });
  };
  const zoom = (delta: number) => {
    const next = clamp(round1(scale + delta), ZOOM_MIN, ZOOM_MAX);
    socket.emit('view:zoom', { locationId: previewLocationId, scale: next });
  };
  const playersStep = (delta: number) => {
    if (!grid) return;
    socket.emit('grid:update', { locationId: previewLocationId, opacity: clamp(round1(playersOpacity + delta), 0, 1) });
  };

  return (
    <Box id="pan-zoom-section" title="Controlli">
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-1.5">
          {PAD.flat().map((k, i) => (k
            ? <Button key={i} type="button" variant="outline" className="size-12 text-lg" onClick={() => pan(k)}>{k}</Button>
            : <span key={i} />))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="outline" className="size-12 text-lg" title="Aumenta zoom" aria-label="Aumenta zoom" onClick={() => zoom(ZOOM_STEP)}>+</Button>
          <Button type="button" variant="outline" className="size-12 text-lg" title="Riduci zoom" aria-label="Riduci zoom" onClick={() => zoom(-ZOOM_STEP)}>−</Button>
          <Button type="button" variant="outline" className="size-12 text-lg" title="Reset vista" aria-label="Reset vista" onClick={() => socket.emit('view:reset', { locationId: previewLocationId })}>⟳</Button>
        </div>
      </div>
      {gridOn && (
        <>
          <Stepper
            label="Griglia (tu)" value={`${Math.round(dmGridOpacity * 100)}%`}
            decTitle="Riduci opacità griglia (solo per te)" incTitle="Aumenta opacità griglia (solo per te)"
            onDec={() => setDmGridOpacity(clamp(round1(dmGridOpacity - GRID_OPACITY_STEP), 0, 1))}
            onInc={() => setDmGridOpacity(clamp(round1(dmGridOpacity + GRID_OPACITY_STEP), 0, 1))}
          />
          <Stepper
            label="Griglia (giocatori)" value={`${Math.round(playersOpacity * 100)}%`}
            decTitle="Riduci opacità griglia" incTitle="Aumenta opacità griglia"
            onDec={() => playersStep(-GRID_OPACITY_STEP)} onInc={() => playersStep(GRID_OPACITY_STEP)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Griglia visibile solo per te</span>
            <Button
              type="button" variant="outline" size="icon" className="size-10"
              title="Mostra/nascondi la griglia solo nella tua vista"
              aria-label="Mostra/nascondi la griglia solo nella tua vista"
              aria-pressed={dmGridVisible} onClick={toggleDmGridVisible}
            >
              {dmGridVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </Button>
          </div>
        </>
      )}
    </Box>
  );
}
