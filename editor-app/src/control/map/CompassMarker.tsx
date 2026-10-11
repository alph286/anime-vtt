import { selectPreviewLocation, selectShowingImage, useControlStore } from '../store/control-store';

// Bussola sull'anteprima del DM: fuori da pan rispecchia la posizione vista
// dai giocatori su /display (x%/y% dello stesso tipo di contenitore "a
// schermo intero", non lo spazio locale della mappa: resta stabile anche
// con lo zoom locale). In pan si fissa in basso a destra (.pinned), fuori
// dai piedi del riquadro giallo, ma ruota comunque con compass.rotation.
export function CompassMarker() {
  const compass = useControlStore((s) => selectPreviewLocation(s)?.map.compass);
  const showingImage = useControlStore(selectShowingImage);
  const pinned = useControlStore((s) => s.mode === 'pan');
  const visible = Boolean(compass?.visible) && !showingImage;
  const style: React.CSSProperties = !compass || !visible
    ? {}
    : pinned
      ? { transform: `rotate(${compass.rotation}deg)` }
      : {
          left: `${compass.x}%`,
          top: `${compass.y}%`,
          transform: `translate(-50%, -50%) rotate(${compass.rotation}deg)`,
        };
  return (
    <div
      id="map-compass-marker"
      className={`map-compass-marker${visible && pinned ? ' pinned' : ''}`}
      hidden={!visible}
      style={style}
    >
      <svg viewBox="0 0 120 120">
        <path className="compass-star" d="M60,12 L74,46 L108,60 L74,74 L60,108 L46,74 L12,60 L46,46 Z" />
        <circle className="compass-hub" cx="60" cy="60" r="7" />
        <text x="60" y="10" textAnchor="middle">N</text>
        <text x="60" y="118" textAnchor="middle">S</text>
        <text x="114" y="64" textAnchor="middle">E</text>
        <text x="6" y="64" textAnchor="middle">O</text>
      </svg>
    </div>
  );
}
