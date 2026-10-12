import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useControlStore } from '../control/store/control-store';
import type { ControlState } from '../control/types';

export const PARTY_NUDGE_POS_KEY = 'partyAoeNudgeOverlayPos';

// /party non ha anteprima né modalità: guarda sempre la location attiva e il
// pannello AOE è sempre attivo. receiveState() di /control ripiega
// sull'anteprima precedente e fa uscire dalla modalità quando l'AOE non è
// "disponibile" (immagine mostrata, mappa senza file): qui si forza di nuovo
// lo stato di /party subito dopo.
export function syncPartyState(s: ControlState): void {
  useControlStore.getState().receiveState(s);
  useControlStore.setState((d) => {
    d.previewLocationId = s.activeLocationId ?? null;
    const loc = d.server?.locations.find((l) => l.id === s.activeLocationId);
    if (d.selectedAoeId && !(loc?.map.aoes ?? []).some((a) => a.id === d.selectedAoeId)) {
      d.selectedAoeId = null;
    }
    d.mode = 'aoe';
  });
}

export function usePartySocket(): void {
  useEffect(() => {
    const st = () => useControlStore.getState();
    // Lo zoom locale di /control è persistito nello stesso localStorage: qui
    // non esiste, va azzerato in memoria (senza toccare lo storage).
    st().resetLocalZoom();
    const onConnect = () => { st().setConnected(true); socket.emit('hello', { role: 'party' }); };
    const onDisconnect = () => st().setConnected(false);
    const onState = (s: ControlState) => syncPartyState(s);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state:update', onState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state:update', onState);
    };
  }, []);
}
