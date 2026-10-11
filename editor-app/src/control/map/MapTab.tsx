import { AoePanel } from '../aoe/AoePanel';
import { AudioBox } from '../boxes/AudioBox';
import { FogBox } from '../boxes/FogBox';
import { PanBox } from '../boxes/PanBox';
import { PingBox } from '../boxes/PingBox';
import { ZoomBox } from '../boxes/ZoomBox';
import { useControlStore } from '../store/control-store';
import MapPreview from './MapPreview';
import { ModeToggles } from './ModeToggles';

// I pulsanti modalita stanno sopra la mappa, FUORI da #map-preview (come nel
// pannello originale: #map-mode-toggles precede #map-column). Sotto la mappa
// va UN solo box, scelto dalla modalita attiva.
export default function MapTab() {
  const mode = useControlStore((s) => s.mode);
  return (
    <div data-testid="map-tab" className="flex flex-col gap-2.5">
      <ModeToggles />
      <MapPreview />
      {mode === 'pan' && <PanBox />}
      {mode === 'fog' && <FogBox />}
      {mode === 'zoom' && <ZoomBox />}
      {mode === 'ping' && <PingBox />}
      {mode === 'aoe' && <AoePanel />}
      <AudioBox />
    </div>
  );
}
