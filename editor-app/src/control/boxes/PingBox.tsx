import { Compass } from 'lucide-react';
import { socket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { Box, clamp } from './Box';

const COMPASS_NUDGE_STEP = 2;

// Box "Rosa dei venti" (modalita ping): visibilita, nudge e rotazione 90.
export function PingBox() {
  const location = useControlStore(selectPreviewLocation);
  const previewLocationId = useControlStore((s) => s.previewLocationId);
  const compass = location?.map.compass;
  const emit = (patch: Record<string, unknown>) =>
    socket.emit('compass:update', { locationId: previewLocationId, ...patch });

  const nudge = (dx: number, dy: number) => {
    if (!compass) return;
    emit({
      x: clamp(compass.x + dx * COMPASS_NUDGE_STEP, 0, 100),
      y: clamp(compass.y + dy * COMPASS_NUDGE_STEP, 0, 100),
    });
  };
  const nudgeBtn = (label: string, title: string, dx: number, dy: number) => (
    <Button type="button" variant="outline" className="size-12 text-lg" title={title} aria-label={title} onClick={() => nudge(dx, dy)}>{label}</Button>
  );

  return (
    <Box id="compass-section" title="Rosa dei venti">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">Visibile</span>
        <Button
          type="button" variant="outline" size="icon"
          title="Mostra/nascondi rosa dei venti" aria-label="Mostra/nascondi rosa dei venti"
          aria-pressed={Boolean(compass?.visible)}
          className={cn('size-10', compass?.visible && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:bg-primary dark:hover:bg-primary/90')}
          onClick={() => { if (compass) emit({ visible: !compass.visible }); }}
        >
          <Compass className="size-4" />
        </Button>
      </div>
      <div className="mx-auto grid grid-cols-3 gap-1.5">
        <span />{nudgeBtn('▲', 'Sposta su', 0, -1)}<span />
        {nudgeBtn('◀', 'Sposta a sinistra', -1, 0)}
        <Button
          type="button" variant="outline" className="size-12 text-lg" title="Ruota 90°" aria-label="Ruota 90°"
          onClick={() => { if (compass) emit({ rotation: (((compass.rotation + 90) % 360) + 360) % 360 }); }}
        >↻</Button>
        {nudgeBtn('▶', 'Sposta a destra', 1, 0)}
        <span />{nudgeBtn('▼', 'Sposta giù', 0, 1)}<span />
      </div>
    </Box>
  );
}
