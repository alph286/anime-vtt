import { useRef } from 'react';
import { Compass as CompassIcon, Crosshair, Grid3x3, Maximize, RotateCcw, RotateCw, Sparkles, Square, Trash2, Upload, ZoomIn } from 'lucide-react';
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarMenu, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger,
} from '@/components/ui/menubar';
import { NumberField } from '@/components/NumberField';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { checkVideoSafe } from '@/lib/video-check';
import { socket } from '@/lib/socket';
import { stageRefs } from '@/stage/stage-refs';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { ColorField } from './ColorField';
import { MenuField } from './MenuField';

const triggerClass = 'gap-1.5 data-[active=true]:text-primary';

export function MenuBar() {
  const location = useEditorStore(selectActiveLocation);
  const editorZoom = useEditorStore((s) => s.editorZoom);
  const fogOpacity = useEditorStore((s) => s.fogOpacity);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
  const mode = useEditorStore((s) => s.mode);
  const selectedShaderType = useEditorStore((s) => s.selectedShaderType);
  const squareConstrain = useEditorStore((s) => s.gridSquareConstrain);
  const colorPicking = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const arm = useArmConfirm();
  const disabled = !location;

  const onUpload = async (file: File | undefined) => {
    if (!file || !location) return;
    const { setUploadWarning } = useEditorStore.getState();
    setUploadWarning(null);
    if (isVideoFile(file.name)) {
      const check = await checkVideoSafe(file);
      if (!check.ok) {
        setUploadWarning(`Upload bloccato: ${check.reason}`);
        return;
      }
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    await fetch('/api/upload/map', { method: 'POST', body: formData });
  };

  return (
    <>
      <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ''; }} />
      <Menubar
        className="h-10 border-0 bg-transparent p-0 shadow-none"
        onValueChange={(v) => { if (v === 'shaders') setSidebarTab('shader'); }}
      >
        <MenubarMenu value="mappa">
          <MenubarTrigger className={triggerClass} data-active={Boolean(location?.map.flip180 || location?.map.rotate90)}>
            <Upload className="size-4" /> Mappa
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={disabled} onSelect={() => fileInput.current?.click()}>
              <Upload /> Carica mappa
            </MenubarItem>
            <MenubarItem
              disabled={disabled}
              className={arm.isArmed('remove-map') ? 'text-destructive' : ''}
              onSelect={(e) => {
                if (!arm.isArmed('remove-map')) e.preventDefault();
                arm.press('remove-map', async () => {
                  useEditorStore.getState().setUploadWarning(null);
                  await fetch('/api/map/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId: location!.id }),
                  });
                });
              }}
            >
              <Trash2 /> {arm.isArmed('remove-map') ? 'Click di nuovo per confermare' : 'Rimuovi mappa'}
            </MenubarItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={Boolean(location?.map.flip180)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('mapFlip:toggle', { locationId: location!.id })}
            >
              <RotateCcw /> Ruota 180°
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={Boolean(location?.map.rotate90)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('mapRotate90:toggle', { locationId: location!.id })}
            >
              <RotateCw /> Ruota 90°
            </MenubarCheckboxItem>
            <MenuField label="Scala" title="Scala mappa">
              <NumberField
                aria-label="Scala mappa"
                className="h-8 w-20"
                live
                min={25}
                max={1000}
                disabled={disabled}
                value={Math.round((location?.map.scale ?? 1) * 100)}
                onCommit={(v) => {
                  useEditorStore.getState().mutateLocation((loc) => { loc.map.scale = v / 100; });
                  socket.emit('mapScale:set', { locationId: location!.id, scale: v / 100 });
                }}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu value="griglia">
          <MenubarTrigger
            className={triggerClass}
            data-active={Boolean(location?.map.grid.enabled || mode === 'grid-align' || squareConstrain)}
          >
            <Grid3x3 className="size-4" /> Griglia
          </MenubarTrigger>
          <MenubarContent
            onFocusOutside={(e) => { if (colorPicking.current) e.preventDefault(); }}
            onInteractOutside={(e) => { if (colorPicking.current) e.preventDefault(); }}
          >
            <MenubarCheckboxItem
              disabled={disabled}
              checked={Boolean(location?.map.grid.enabled)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('grid:update', { locationId: location!.id, enabled: !location!.map.grid.enabled })}
            >
              <Grid3x3 /> Mostra griglia
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={mode === 'grid-align'}
              onCheckedChange={() => useEditorStore.getState().chooseGridAlignTool()}
            >
              <Crosshair /> Allinea alla griglia
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={squareConstrain}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => useEditorStore.getState().toggleSquareConstrain()}
            >
              <Square /> Vincola a quadrato
            </MenubarCheckboxItem>
            <MenuField label="Divisioni" title="Dividi la cella tracciata in N parti">
              <NumberField aria-label="Divisioni" className="h-8 w-20" min={1} max={20} step={1} disabled={disabled}
                value={location?.map.grid.divisions ?? 1}
                onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, divisions: v })} />
            </MenuField>
            <MenuField label="Colore" title="Colore griglia">
              <div onPointerDown={() => { colorPicking.current = true; }} onBlur={() => { colorPicking.current = false; }}>
                <ColorField
                  disabled={disabled}
                  value={location?.map.grid.color || '#ffffff'}
                  onLive={(v) => useEditorStore.getState().mutateLocation((loc) => { loc.map.grid.color = v; })}
                  onCommit={(v) => { colorPicking.current = false; socket.emit('grid:update', { locationId: location!.id, color: v }); }}
                />
              </div>
            </MenuField>
            <MenuField label="Spessore" title="Spessore tratto griglia">
              <NumberField aria-label="Spessore griglia" className="h-8 w-20" min={0.2} max={5} step={0.1} disabled={disabled}
                value={location?.map.grid.lineWidth || 0.3}
                onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, lineWidth: v })} />
            </MenuField>
            <MenuField label="Opacità" title="Opacità griglia">
              <NumberField aria-label="Opacità griglia" className="h-8 w-20" min={0} max={100} step={10} disabled={disabled}
                value={Math.round((location?.map.grid.opacity ?? 1) * 100)}
                onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, opacity: v / 100 })} />
              <span className="text-xs text-muted-foreground">%</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu value="shaders">
          <MenubarTrigger className={triggerClass} data-active={mode === 'shader-place'}>
            <Sparkles className="size-4" /> Shaders
          </MenubarTrigger>
          <MenubarContent>
            <MenubarSub>
              <MenubarSubTrigger disabled={disabled}><Sparkles /> Portali</MenubarSubTrigger>
              <MenubarSubContent>
                {[
                  { id: 'portal', label: 'Blu' },
                  { id: 'portal_red', label: 'Rosso' },
                  { id: 'green_fire', label: 'Verde' },
                ].map((s) => (
                  <MenubarCheckboxItem
                    key={s.id}
                    checked={mode === 'shader-place' && selectedShaderType === s.id}
                    onCheckedChange={() => useEditorStore.getState().chooseShaderTool(s.id)}
                  >
                    <Sparkles /> {s.label}
                  </MenubarCheckboxItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu value="bussola">
          <MenubarTrigger className={triggerClass} data-active={Boolean(location?.map.compass?.visible)}>
            <CompassIcon className="size-4" /> Bussola
          </MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem
              disabled={!location?.map.compass}
              checked={Boolean(location?.map.compass?.visible)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('compass:update', { locationId: location!.id, visible: !location!.map.compass!.visible })}
            >
              Mostra rosa dei venti
            </MenubarCheckboxItem>
            <MenuField label="Rotazione" title="Rotazione rosa dei venti">
              <NumberField
                aria-label="Rotazione rosa dei venti"
                className="h-8 w-20"
                min={0}
                max={359}
                step={1}
                disabled={!location?.map.compass}
                value={location?.map.compass?.rotation ?? 0}
                onCommit={(v) => socket.emit('compass:update', { locationId: location!.id, rotation: Math.round(v) })}
              />
              <span className="text-xs text-muted-foreground">°</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu value="vista">
          <MenubarTrigger className={triggerClass}>
            <ZoomIn className="size-4" /> Vista
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              onSelect={(e) => {
                e.preventDefault();
                useEditorStore.getState().setEditorZoom(1);
                if (stageRefs.canvas) { stageRefs.canvas.scrollLeft = 0; stageRefs.canvas.scrollTop = 0; }
              }}
            >
              <Maximize /> Reset zoom ({Math.round(editorZoom * 100)}%)
            </MenubarItem>
            <MenuField label="Opacità fog" title="Opacità fog (solo anteprima editor)">
              <NumberField
                aria-label="Opacità fog"
                className="h-8 w-20"
                min={0}
                max={100}
                value={Math.round(fogOpacity * 100)}
                onCommit={(v) => useEditorStore.getState().setFogOpacity(v / 100)}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </>
  );
}
