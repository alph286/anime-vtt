import MapPreview from './MapPreview';
import { ModeToggles } from './ModeToggles';

// Provvisorio: il Task 7 lo sostituisce con la composizione completa
// (sezioni sotto la mappa). I pulsanti modalita stanno sopra la mappa, FUORI
// da #map-preview, come nel pannello originale (index.html: #map-mode-toggles
// precede #map-column).
export default function MapTab() {
  return (
    <div data-testid="map-tab" className="flex flex-col gap-2.5">
      <ModeToggles />
      <MapPreview />
    </div>
  );
}
