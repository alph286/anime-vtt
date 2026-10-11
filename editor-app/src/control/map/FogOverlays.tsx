import { selectPreviewLocation, useControlStore } from '../store/control-store';

// Il CSS rotate() del wrap trasforma gia questo rendering locale (non
// ruotato) nell'aspetto corretto a schermo: i punti dei poligoni si usano
// cosi come sono, nello spazio base salvato, mai pre-ruotati qui.
// I click sui bottoni li gestiranno i gesti della modalita fog (data-id).
export function FogOverlays() {
  const polygons = useControlStore((s) => selectPreviewLocation(s)?.map.polygons);
  const fogOpacity = useControlStore((s) => s.fogOpacity);
  return (
    <div className="fog-layer" id="map-fog-layer">
      {(polygons ?? []).map((p) => (
        <button
          key={p.id}
          type="button"
          className={`fog-overlay ${p.revealed ? 'revealed' : ''}`}
          style={{ clipPath: polygonClipPath(p.points), opacity: p.revealed ? '1' : String(fogOpacity) }}
          data-id={p.id}
          title={p.name}
        />
      ))}
    </div>
  );
}
