import { Button } from '@/components/ui/button';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectPreviewLocation, useControlStore } from '../store/control-store';

// Scheda Fog: elenco zone della location in anteprima (tocco = rivela/nascondi),
// "Nascondi tutto" diretto, "Rivela tutto" arma-poi-conferma (2,5 s).
export default function FogTab() {
  const location = useControlStore(selectPreviewLocation);
  const previewLocationId = useControlStore((s) => s.previewLocationId);
  const arm = useArmConfirm(2500);
  const polygons = location?.map.polygons ?? [];
  const revealArmed = arm.isArmed('reveal-all');

  const hideAll = () => {
    if (!previewLocationId) return;
    socket.emit('fow:setAll', { locationId: previewLocationId, revealed: false });
  };
  const revealAll = () => {
    if (!previewLocationId) return;
    arm.press('reveal-all', () =>
      socket.emit('fow:setAll', { locationId: previewLocationId, revealed: true }),
    );
  };

  return (
    <div data-testid="fog-tab" className="flex flex-col gap-2 p-3">
      <p className="text-xs text-muted-foreground">Tocca una zona per rivelarla o nasconderla.</p>
      <div className="fow-bulk flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={hideAll}>
          Nascondi tutto
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-11 flex-1',
            revealArmed && 'confirm border-[var(--danger)] bg-[var(--danger)] text-white hover:bg-[var(--danger)] hover:text-white',
          )}
          onClick={revealAll}
        >
          {revealArmed ? 'Click di nuovo per confermare' : 'Rivela tutto'}
        </Button>
      </div>
      <div id="fow-list" className="flex flex-col gap-2">
        {polygons.map((poly) => (
          <button
            key={poly.id}
            type="button"
            className={cn(
              'fow-row flex min-h-12 items-center justify-between rounded-lg border px-3.5 py-3 text-left text-[15px]',
              poly.revealed
                ? 'revealed border-[var(--vtt-accent)] bg-[var(--accent-bg-subtle)] text-[var(--vtt-accent)]'
                : 'border-[var(--border-control)] bg-[var(--bg-control)]',
            )}
            onClick={() => {
              if (previewLocationId) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: poly.id });
            }}
          >
            <span>{poly.name}</span>
            <span className={cn('fow-state text-xs', poly.revealed ? 'text-[var(--vtt-accent)]' : 'text-muted-foreground')}>
              {poly.revealed ? 'rivelata' : 'nascosta'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
