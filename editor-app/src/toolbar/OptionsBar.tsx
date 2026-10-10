import { Check, MousePointer2, Redo2, Trash2, Undo2, X, Pentagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { socket } from '@/lib/socket';
import { deletePolygonWithHistory } from '@/stage/actions';
import {
  selectActiveLocation, selectCanRedo, selectCanUndo, selectRedoTitle, selectUndoTitle, useEditorStore,
} from '@/store/editor-store';

export function OptionsBar() {
  const location = useEditorStore(selectActiveLocation);
  const mode = useEditorStore((s) => s.mode);
  const drawing = useEditorStore((s) => s.drawing);
  const selectedPolygonId = useEditorStore((s) => s.selectedPolygonId);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undoTitle = useEditorStore(selectUndoTitle);
  const redoTitle = useEditorStore(selectRedoTitle);
  const { chooseSelectTool, chooseDrawTool, resetDrawing, setMode, undoAction, redoAction } = useEditorStore.getState();
  const arm = useArmConfirm();
  const disabled = !location;
  const armed = selectedPolygonId !== null && arm.isArmed(selectedPolygonId);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-card px-6 py-2">
      <Button size="sm" variant={mode === 'select' ? 'secondary' : 'ghost'} disabled={disabled} onClick={chooseSelectTool}>
        <MousePointer2 /> Seleziona
      </Button>
      <Button size="sm" variant={mode === 'draw' ? 'secondary' : 'ghost'} disabled={disabled} onClick={chooseDrawTool}>
        <Pentagon /> Disegna area
      </Button>
      {drawing.points.length >= 3 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!location) return;
            const name = `Area ${(location.map.polygons ?? []).length + 1}`;
            socket.emit('polygon:create', { locationId: location.id, name, points: drawing.points });
            resetDrawing();
            setMode('select');
          }}
        >
          <Check /> Termina
        </Button>
      )}
      {drawing.points.length > 0 && (
        <Button size="sm" variant="ghost" onClick={resetDrawing}>
          <X /> Annulla
        </Button>
      )}
      <Button
        size="sm"
        variant={armed ? 'destructive' : 'ghost'}
        disabled={disabled || !selectedPolygonId}
        title={armed ? 'Click di nuovo per confermare' : 'Elimina selezionato'}
        onClick={() => selectedPolygonId && arm.press(selectedPolygonId, () => deletePolygonWithHistory(selectedPolygonId))}
      >
        <Trash2 /> Elimina area
      </Button>
      <Separator orientation="vertical" className="mx-2 h-6" />
      <Button size="sm" variant="ghost" disabled={!canUndo} title={undoTitle} onClick={undoAction}>
        <Undo2 /> Annulla
      </Button>
      <Button size="sm" variant="ghost" disabled={!canRedo} title={redoTitle} onClick={redoAction}>
        <Redo2 /> Ripeti
      </Button>
    </div>
  );
}
