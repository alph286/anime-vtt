import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { aoeShapeLabel, formatMeters } from '../lib/aoe-ops';

// Lista aree: una pillola per area (selezione), elimina con arma-poi-conferma. Una sola area armata alla volta; cambiare
// selezione disarma. Le pillole si ricostruiscono a ogni render, quindi lo
// stato "armato" vive nell'hook, non nel DOM.
export function AoeChipList() {
  const location = useControlStore(selectPreviewLocation);
  const previewLocationId = useControlStore((s) => s.previewLocationId);
  const selectedAoeId = useControlStore((s) => s.selectedAoeId);
  const selectAoe = useControlStore((s) => s.selectAoe);
  const arm = useArmConfirm(2500);
  const aoes = location?.map.aoes ?? [];
  const { disarm } = arm;

  // Come setSelectedAoeId dell'originale: la selezione cambiata da qualunque
  // fonte (tap sulla mappa, piazzamento, cambio location) disarma l'elimina.
  useEffect(() => {
    disarm();
  }, [selectedAoeId, disarm]);

  const toggleSelect = (id: string) => {
    arm.disarm();
    selectAoe(selectedAoeId === id ? null : id);
  };

  return (
    <div id="aoe-chip-list" className="mt-1 flex flex-wrap gap-2.5">
      {aoes.map((a) => {
        const selected = a.id === selectedAoeId;
        const armed = arm.isArmed(a.id);
        return (
          <div key={a.id} className={cn('aoe-chip flex items-center', selected && 'selected')} data-id={a.id}>
            <div
              className={cn(
                'aoe-chip-pill flex h-11 items-center gap-1.5 overflow-hidden rounded-lg border pl-3',
                selected ? 'border-[var(--vtt-accent)] bg-[var(--vtt-accent)]/10' : 'border-border bg-card',
              )}
            >
              <button type="button" className="aoe-chip-label h-full text-sm" onClick={() => toggleSelect(a.id)}>
                {aoeShapeLabel(a.shape)} {formatMeters(a.sizeM)}m
              </button>
              <button
                type="button"
                className={cn(
                  'aoe-chip-delete flex h-11 w-11 items-center justify-center',
                  armed && 'confirm bg-destructive text-white',
                )}
                title={armed ? 'Tocca di nuovo per confermare' : 'Rimuovi'}
                aria-label={armed ? 'Tocca di nuovo per confermare' : 'Rimuovi'}
                onClick={() => arm.press(a.id, () => socket.emit('aoe:remove', { locationId: previewLocationId, aoeId: a.id }))}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
