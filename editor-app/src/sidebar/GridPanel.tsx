import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/NumberField';
import { nudgeOffsets } from '@/lib/grid-math';
import { socket } from '@/lib/socket';
import { pushGridHistory } from '@/stage/actions';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

const PAD: { dx: number; dy: number; icon: ReactNode; label: string; col: number; row: number }[] = [
  { dx: 0, dy: -1, icon: <ChevronUp />, label: 'Su', col: 2, row: 1 },
  { dx: -1, dy: 0, icon: <ChevronLeft />, label: 'Sinistra', col: 1, row: 2 },
  { dx: 1, dy: 0, icon: <ChevronRight />, label: 'Destra', col: 3, row: 2 },
  { dx: 0, dy: 1, icon: <ChevronDown />, label: 'Giù', col: 2, row: 3 },
];

export function GridPanel() {
  const location = useEditorStore(selectActiveLocation);
  const disabled = !location;
  const grid = location?.map.grid;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Label>Cella (px)</Label>
        <NumberField aria-label="Dimensione cella" className="h-8 w-24" min={4} max={1000} disabled={disabled}
          value={grid?.cellSize ?? 100}
          onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, cellSize: v })} />
      </div>
      <div>
        <Label className="mb-2 block">Sposta</Label>
        <div className="grid w-32 grid-cols-3 grid-rows-3 gap-1">
          {PAD.map((b) => (
            <Button
              key={b.label}
              variant="secondary"
              size="icon"
              title={b.label}
              disabled={disabled}
              style={{ gridColumn: b.col, gridRow: b.row }}
              onClick={() => {
                if (!location) return;
                const patch = nudgeOffsets(location.map.grid, b.dx, b.dy);
                pushGridHistory('griglia spostata', patch);
                socket.emit('grid:update', { locationId: location.id, ...patch });
              }}
            >
              {b.icon}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Offset X</Label>
          <NumberField aria-label="Offset X" className="h-8" min={-100000} max={100000} disabled={disabled}
            value={grid?.offsetX ?? 0}
            onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, offsetX: v })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Offset Y</Label>
          <NumberField aria-label="Offset Y" className="h-8" min={-100000} max={100000} disabled={disabled}
            value={grid?.offsetY ?? 0}
            onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, offsetY: v })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => socket.emit('gridPreset:save', { locationId: location!.id })}>
          Salva come predefinita
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => socket.emit('gridPreset:apply', { locationId: location!.id })}>
          Applica predefinita
        </Button>
      </div>
    </div>
  );
}
