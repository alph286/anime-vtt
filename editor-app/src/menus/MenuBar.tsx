import { useRef } from 'react';
import { Maximize, RotateCcw, RotateCw, Trash2, Upload, ZoomIn } from 'lucide-react';
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger,
} from '@/components/ui/menubar';
import { NumberField } from '@/components/NumberField';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { checkVideoSafe } from '@/lib/video-check';
import { socket } from '@/lib/socket';
import { stageRefs } from '@/stage/stage-refs';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { MenuField } from './MenuField';

const triggerClass = 'gap-1.5 data-[active=true]:text-primary';

export function MenuBar() {
  const location = useEditorStore(selectActiveLocation);
  const editorZoom = useEditorStore((s) => s.editorZoom);
  const fogOpacity = useEditorStore((s) => s.fogOpacity);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
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

        {/* Griglia, Shaders, Bussola: task 7, 10, 11 */}

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
