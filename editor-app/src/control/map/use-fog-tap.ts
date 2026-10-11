import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import { mapRefs } from './map-refs';

// Tocco sul fog (porting di control.js, listener 'click' su #map-fog-layer):
// solo in modalita fog, un click su una zona la rivela/nasconde sulla
// location IN ANTEPRIMA (non necessariamente quella attiva). Delegato sul
// preview: le zone sono bottoni ricreati ad ogni render di FogOverlays.
export function useFogTap() {
  useEffect(() => {
    const preview = mapRefs.preview;
    if (!preview) return;
    const onClick = (e: MouseEvent) => {
      const s = useControlStore.getState();
      if (s.mode !== 'fog') return;
      const overlay = (e.target as Element | null)?.closest?.('.fog-layer .fog-overlay') as HTMLElement | null;
      if (!overlay || !preview.contains(overlay)) return;
      socket.emit('fow:toggle', { locationId: s.previewLocationId, polygonId: overlay.dataset.id });
    };
    preview.addEventListener('click', onClick);
    return () => preview.removeEventListener('click', onClick);
  }, []);
}
