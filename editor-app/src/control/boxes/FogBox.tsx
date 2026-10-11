import { Stepper } from '../components/Stepper';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { Box, clamp, round1 } from './Box';

const FOG_OPACITY_STEP = 0.1;

// Box "Fog of war" (modalita fog): opacita locale al DM e percentuale di
// zone rivelate sulla location in anteprima.
export function FogBox() {
  const location = useControlStore(selectPreviewLocation);
  const fogOpacity = useControlStore((s) => s.fogOpacity);
  const setFogOpacity = useControlStore((s) => s.setFogOpacity);
  const polygons = location?.map.polygons ?? [];
  const total = polygons.length;
  const revealed = polygons.filter((p) => p.revealed).length;
  const step = (d: number) => setFogOpacity(clamp(round1(fogOpacity + d), 0, 1));

  return (
    <Box id="fog-section" title="Fog of war">
      <Stepper
        label="Opacità" value={`${Math.round(fogOpacity * 100)}%`}
        decTitle="Riduci opacità fog" incTitle="Aumenta opacità fog"
        onDec={() => step(-FOG_OPACITY_STEP)} onInc={() => step(FOG_OPACITY_STEP)}
      />
      {total > 0 && (
        <div id="fog-progress-row" className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm"><span>Rivelate</span><span>{revealed}/{total}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              id="fog-progress-fill"
              className="h-full origin-left bg-primary transition-transform"
              style={{ transform: `scaleX(${revealed / total})` }}
            />
          </div>
        </div>
      )}
    </Box>
  );
}
