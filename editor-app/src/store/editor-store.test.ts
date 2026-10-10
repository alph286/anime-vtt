import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VttState } from '@/types';
import { selectActiveLocation, selectCanUndo, selectUndoTitle, useEditorStore } from './editor-store';

function makeState(activeLocationId: string | null = 'a'): VttState {
  const grid = { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.3, opacity: 1 };
  const audio = { name: '', file: null, volume: 0.7 };
  return {
    activeLocationId,
    locations: [{
      id: 'a', name: 'A', archived: false, images: [],
      map: {
        file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid,
        audio: { main: audio, special: audio }, shaders: [],
        polygons: [{ id: 'p1', name: 'P1', points: [[0, 0], [10, 0], [10, 10]], revealed: false }],
      },
    }],
  };
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

describe('stato server', () => {
  it('receiveState espone la location attiva', () => {
    useEditorStore.getState().receiveState(makeState());
    expect(selectActiveLocation(useEditorStore.getState())?.id).toBe('a');
  });

  it('senza location attiva riporta modalità e selezioni ai default', () => {
    const s = useEditorStore.getState();
    s.receiveState(makeState());
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.select({ polygon: 'p1', shader: 's1' });
    s.receiveState(makeState(null));
    const after = useEditorStore.getState();
    expect(after.mode).toBe('select');
    expect(after.drawing.points).toEqual([]);
    expect(after.selectedPolygonId).toBeNull();
    expect(after.selectedShaderId).toBeNull();
  });

  it('mutateLocation modifica solo la location attiva', () => {
    const s = useEditorStore.getState();
    s.receiveState(makeState());
    s.mutateLocation((loc) => { loc.map.polygons[0].points[1] = [50, 50]; });
    expect(selectActiveLocation(useEditorStore.getState())?.map.polygons[0].points[1]).toEqual([50, 50]);
  });
});

describe('strumenti', () => {
  it('chooseDrawTool deseleziona il poligono; chooseShaderTool imposta il tipo e azzera la bozza', () => {
    const s = useEditorStore.getState();
    s.select({ polygon: 'p1' });
    s.chooseDrawTool();
    expect(useEditorStore.getState().selectedPolygonId).toBeNull();
    expect(useEditorStore.getState().mode).toBe('draw');
    s.addDrawPoint([1, 1]);
    s.chooseShaderTool('portal_red');
    const after = useEditorStore.getState();
    expect(after.mode).toBe('shader-place');
    expect(after.selectedShaderType).toBe('portal_red');
    expect(after.drawing.points).toEqual([]);
  });

  it('finishTool torna a select', () => {
    const s = useEditorStore.getState();
    s.chooseGridAlignTool();
    s.finishTool();
    expect(useEditorStore.getState().mode).toBe('select');
  });
});

describe('undo/redo', () => {
  it('in modalità draw agisce solo sui punti della bozza', () => {
    const s = useEditorStore.getState();
    const undo = vi.fn();
    s.recordHistory('x', undo, vi.fn());
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.addDrawPoint([2, 2]);
    s.undoAction();
    expect(useEditorStore.getState().drawing.points).toEqual([[1, 1]]);
    expect(undo).not.toHaveBeenCalled();
    expect(selectCanUndo(useEditorStore.getState())).toBe(true);
    expect(selectUndoTitle(useEditorStore.getState())).toBe('Annulla: ultimo punto');
  });

  it('fuori da draw esegue le voci dello storico globale', () => {
    const s = useEditorStore.getState();
    const undo = vi.fn();
    const redo = vi.fn();
    s.recordHistory('area spostata', undo, redo);
    expect(selectUndoTitle(useEditorStore.getState())).toBe('Annulla: area spostata');
    s.undoAction();
    expect(undo).toHaveBeenCalledOnce();
    s.redoAction();
    expect(redo).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().history.undo).toHaveLength(1);
  });
});

describe('cambio location', () => {
  it('resetForLocationChange azzera selezione, bozza e zoom', () => {
    const s = useEditorStore.getState();
    s.select({ polygon: 'p1' });
    s.setEditorZoom(2);
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.resetForLocationChange();
    const after = useEditorStore.getState();
    expect(after.selectedPolygonId).toBeNull();
    expect(after.drawing.points).toEqual([]);
    expect(after.editorZoom).toBe(1);
  });
});
