import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { Box } from '../boxes/Box';
import { Button } from '@/components/ui/button';
import { aoeSizeDimensionLabel, aoeShapeLabel, formatMeters, resizePayload } from '../lib/aoe-ops';
import { selectPreviewLocation, selectSelectedAoe, useControlStore } from '../store/control-store';
import { AoeChipList } from './AoeChipList';
import { AOE_COLOR_BUTTONS, AOE_COLOR_LABELS, AOE_SHADER_MENU, AOE_SHAPES } from './constants';
import {
  MoreIcon, ShapeConeIcon, ShapeCubeIcon, ShapeLineIcon, ShapeSphereIcon, SmokeIcon, WebIcon, WizardHatIcon,
} from './icons';

const SHAPE_ICONS = {
  cone: ShapeConeIcon, cube: ShapeCubeIcon, sphere: ShapeSphereIcon, line: ShapeLineIcon,
} as const;
const SHADER_ICONS: Record<string, () => React.JSX.Element> = {
  web_area: WebIcon, circular_smoke: SmokeIcon, purple_fire: WizardHatIcon,
};

// Riga `etichetta con valore` + [−] [+] (il valore sta nell'etichetta).
function StepRow({ label, decTitle, incTitle, onDec, onInc }: {
  label: string; decTitle: string; incTitle: string; onDec: () => void; onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm tabular-nums">{label}</span>
      <div className="flex gap-1.5">
        <Button type="button" variant="outline" size="icon" className="size-10" title={decTitle} aria-label={decTitle} onClick={onDec}>−</Button>
        <Button type="button" variant="outline" size="icon" className="size-10" title={incTitle} aria-label={incTitle} onClick={onInc}>+</Button>
      </div>
    </div>
  );
}

const btnBase = 'flex h-10 flex-1 items-center justify-center rounded-lg border-2 border-border bg-card';
const activeCls = 'active border-[var(--vtt-accent)]';

// Box AOE (modalita aoe): forme, colori, menu "···", taglia/larghezza e lista
// aree. Con un'area selezionata passa da "prossima area" a "modifica
// quest'area": la forma resta fissa, colore/taglia/larghezza diventano live
// sull'area. Colore e shader del menu formano un unico gruppo mutuamente
// esclusivo, in entrambe le direzioni.
export function AoePanel() {
  const s = useControlStore();
  const location = useControlStore(selectPreviewLocation);
  const editing = useControlStore(selectSelectedAoe);
  const { previewLocationId, patchAoeDefaults, setShaderMenuOpen } = s;
  const grid = location?.map.grid;

  const shape = editing ? editing.shape : s.aoeShape;
  const color = editing ? editing.color : s.aoeColor;
  const size = editing ? editing.sizeM : s.aoeSize;
  const width = editing ? editing.widthM || AOE_METERS_PER_CELL : s.aoeWidth;
  const override = editing ? editing.shaderOverride : s.aoeShaderOverride;
  const dimension = aoeSizeDimensionLabel(shape);

  const emit = (ev: string, payload: Record<string, unknown>) =>
    socket.emit(ev, { locationId: previewLocationId, ...payload });

  const pickColor = (name: string) => {
    if (editing) {
      emit('aoe:setColor', { aoeId: editing.id, color: name });
      if (editing.shaderOverride) emit('aoe:setShaderOverride', { aoeId: editing.id, shaderOverride: null });
      return;
    }
    patchAoeDefaults({ color: name, shaderOverride: null });
  };

  // Riscegliere la stessa voce torna all'abbinamento colore->shader (null) e
  // NON tocca il colore; scegliere applica il colore di default della voce.
  const pickShader = (slug: string) => {
    const next = override === slug ? null : slug;
    const defaultColor = AOE_SHADER_OVERRIDE_DEFAULT_COLOR[slug];
    if (editing) {
      emit('aoe:setShaderOverride', { aoeId: editing.id, shaderOverride: next });
      if (next) emit('aoe:setColor', { aoeId: editing.id, color: defaultColor });
    } else {
      patchAoeDefaults(next ? { shaderOverride: next, color: defaultColor } : { shaderOverride: null });
    }
    setShaderMenuOpen(false);
  };

  const step = (dSize: number, dWidth: number) => {
    if (editing) {
      emit('aoe:resize', resizePayload(editing, dSize, dWidth, grid, s.geometry.naturalW, s.geometry.naturalH));
      return;
    }
    if (dSize) patchAoeDefaults({ size: Math.max(AOE_METERS_PER_CELL, s.aoeSize + dSize) });
    if (dWidth) patchAoeDefaults({ width: Math.max(AOE_METERS_PER_CELL, s.aoeWidth + dWidth) });
  };

  return (
    <Box id="aoe-panel" title="Area d'effetto">
      {editing ? (
        <p id="aoe-editing-label" className="text-sm font-medium">
          Modifica: {aoeShapeLabel(editing.shape)} {formatMeters(editing.sizeM)}m
        </p>
      ) : (
        <div className="aoe-shape-bar flex gap-2">
          {AOE_SHAPES.map(({ shape: sh, label }) => {
            const I = SHAPE_ICONS[sh];
            return (
              <button
                key={sh}
                type="button"
                title={label}
                aria-label={label}
                className={cn('aoe-shape-btn', btnBase, shape === sh && activeCls)}
                onClick={() => patchAoeDefaults({ shape: sh })}
              >
                <I />
              </button>
            );
          })}
        </div>
      )}

      <div className="aoe-color-bar flex gap-2">
        {AOE_COLOR_BUTTONS.map((name) => (
          <button
            key={name}
            type="button"
            title={AOE_COLOR_LABELS[name]}
            aria-label={AOE_COLOR_LABELS[name]}
            style={{ '--aoe-color': aoeColorHex(name), background: 'var(--aoe-color)' } as React.CSSProperties}
            className={cn('aoe-color-btn h-8 flex-1 rounded-lg border-2 border-border', color === name && !override && activeCls)}
            onClick={() => pickColor(name)}
          />
        ))}
        <button
          type="button"
          title="Altri shader"
          aria-label="Altri shader"
          aria-expanded={s.aoeShaderMenuOpen}
          className={cn('aoe-shader-menu-btn h-8 flex-1 rounded-lg border-2 border-border bg-card flex items-center justify-center', override && activeCls)}
          onClick={() => setShaderMenuOpen(!s.aoeShaderMenuOpen)}
        >
          <MoreIcon />
        </button>
      </div>

      {s.aoeShaderMenuOpen && (
        <div id="aoe-shader-menu" className="aoe-shader-menu flex flex-col gap-1.5">
          {AOE_SHADER_MENU.map(({ slug, label }) => {
            const I = SHADER_ICONS[slug];
            return (
              <button
                key={slug}
                type="button"
                className={cn(
                  'aoe-shader-menu-item flex h-10 items-center gap-2 rounded-lg border-2 border-border bg-card px-3 text-sm',
                  override === slug && activeCls,
                )}
                onClick={() => pickShader(slug)}
              >
                <I />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="aoe-size-row flex flex-col gap-2">
        <StepRow
          label={`${dimension}: ${formatMeters(size)} m`}
          decTitle={`Riduci ${dimension.toLowerCase()}`}
          incTitle={`Aumenta ${dimension.toLowerCase()}`}
          onDec={() => step(-AOE_METERS_PER_CELL, 0)}
          onInc={() => step(AOE_METERS_PER_CELL, 0)}
        />
        {shape === 'line' && (
          <StepRow
            label={`Larghezza: ${formatMeters(width)} m`}
            decTitle="Riduci larghezza"
            incTitle="Aumenta larghezza"
            onDec={() => step(0, -AOE_METERS_PER_CELL)}
            onInc={() => step(0, AOE_METERS_PER_CELL)}
          />
        )}
      </div>

      <AoeChipList />
    </Box>
  );
}
