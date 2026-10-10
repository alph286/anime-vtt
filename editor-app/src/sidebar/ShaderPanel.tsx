import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { stepSize, type StepKind } from '@/lib/shader-math';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { deleteShaderWithHistory } from '@/stage/actions';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

const fmt = (m: number) => `${m.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;

export function ShaderPanel() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedShaderId);
  const arm = useArmConfirm();
  const shaders = location?.map.shaders ?? [];
  const armed = selectedId !== null && arm.isArmed(selectedId);

  const step = (id: string, kind: StepKind) => {
    const deco = shaders.find((d) => d.id === id);
    if (!deco || !location) return;
    const { widthM, heightM } = stepSize(deco, kind);
    socket.emit('shader:resize', { locationId: location.id, id, widthM, heightM });
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button
          variant={armed ? 'destructive' : 'ghost'}
          size="icon"
          disabled={!selectedId}
          title={armed ? 'Click di nuovo per confermare' : 'Elimina selezionato'}
          onClick={() => selectedId && arm.press(selectedId, () => deleteShaderWithHistory(selectedId))}
        >
          <Trash2 />
        </Button>
      </div>
      {shaders.length === 0 && <p className="text-sm text-muted-foreground">Nessuna decorazione su questa location.</p>}
      <div className="flex flex-col gap-1">
        {shaders.map((deco) => {
          const selected = deco.id === selectedId;
          const label = (typeof SHADER_EFFECTS !== 'undefined' && SHADER_EFFECTS[deco.shaderId]?.label) || deco.shaderId;
          return (
            <div
              key={deco.id}
              className={cn('rounded-md border p-2', selected && 'border-primary bg-primary/10')}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                const s = useEditorStore.getState();
                s.select({ polygon: null, shader: s.selectedShaderId === deco.id ? null : deco.id });
              }}
            >
              <div className="text-sm font-medium">{label}</div>
              {selected && (
                <div className="mt-2 flex flex-col gap-1">
                  {(['w', 'h'] as const).map((axis) => (
                    <div key={axis} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{axis === 'w' ? 'Larghezza' : 'Altezza'}</span>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="secondary" className="size-7" title="Riduci" onClick={() => step(deco.id, `${axis}-out`)}><Minus /></Button>
                        <span className="w-16 text-center">{fmt(axis === 'w' ? deco.widthM : deco.heightM)}</span>
                        <Button size="icon" variant="secondary" className="size-7" title="Aumenta" onClick={() => step(deco.id, `${axis}-in`)}><Plus /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
