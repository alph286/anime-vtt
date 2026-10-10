import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Location, Point, Rect, VttState } from '@/types';
import {
  addPoint, emptyDraft, emptyHistory, pushEntry, redoPoint, stepRedo, stepUndo, undoPoint,
  type Draft, type HistoryState,
} from '@/lib/history';

export type Mode = 'select' | 'draw' | 'grid-align' | 'shader-place';
export type SidebarTab = 'location' | 'immagini' | 'fog' | 'shader' | 'audio' | 'grid';
export interface Geometry { imageRect: Rect | null; rotation: number; naturalW: number; naturalH: number }

interface EditorStore {
  server: VttState | null;
  mode: Mode;
  drawing: Draft;
  selectedPolygonId: string | null;
  selectedShaderId: string | null;
  selectedShaderType: string;
  fogOpacity: number;
  editorZoom: number;
  gridSquareConstrain: boolean;
  sidebarTab: SidebarTab;
  uploadWarning: string | null;
  history: HistoryState;
  geometry: Geometry;

  receiveState: (s: VttState) => void;
  mutateLocation: (fn: (loc: Location) => void) => void;
  setMode: (mode: Mode) => void;
  chooseSelectTool: () => void;
  chooseDrawTool: () => void;
  chooseGridAlignTool: () => void;
  chooseShaderTool: (shaderId: string) => void;
  finishTool: () => void;
  select: (patch: { polygon?: string | null; shader?: string | null }) => void;
  addDrawPoint: (p: Point) => void;
  resetDrawing: () => void;
  recordHistory: (label: string, undo: () => void, redo: () => void) => void;
  undoAction: () => void;
  redoAction: () => void;
  setGeometry: (g: Geometry) => void;
  setEditorZoom: (z: number) => void;
  setFogOpacity: (v: number) => void;
  toggleSquareConstrain: () => void;
  setSidebarTab: (t: SidebarTab) => void;
  setUploadWarning: (msg: string | null) => void;
  resetForLocationChange: () => void;
}

export const selectActiveLocation = (s: Pick<EditorStore, 'server'>): Location | undefined =>
  s.server?.locations.find((l) => l.id === s.server!.activeLocationId);

export const selectCanUndo = (s: EditorStore) =>
  s.mode === 'draw' ? s.drawing.points.length > 0 : s.history.undo.length > 0;
export const selectCanRedo = (s: EditorStore) =>
  s.mode === 'draw' ? s.drawing.redo.length > 0 : s.history.redo.length > 0;
export const selectUndoTitle = (s: EditorStore) => {
  if (!selectCanUndo(s)) return 'Annulla';
  const target = s.mode === 'draw' ? 'ultimo punto' : s.history.undo[s.history.undo.length - 1]?.label;
  return `Annulla: ${target}`;
};
export const selectRedoTitle = (s: EditorStore) => {
  if (!selectCanRedo(s)) return 'Ripeti';
  const target = s.mode === 'draw' ? 'punto tolto' : s.history.redo[s.history.redo.length - 1]?.label;
  return `Ripeti: ${target}`;
};

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    server: null,
    mode: 'select',
    drawing: emptyDraft(),
    selectedPolygonId: null,
    selectedShaderId: null,
    selectedShaderType: 'portal',
    fogOpacity: 0.45,
    editorZoom: 1,
    gridSquareConstrain: false,
    sidebarTab: 'location',
    uploadWarning: null,
    history: emptyHistory(),
    geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0 },

    receiveState: (s) =>
      set((st) => {
        st.server = s;
        const hasActive = Boolean(s.activeLocationId) && s.locations.some((l) => l.id === s.activeLocationId);
        if (!hasActive) {
          st.mode = 'select';
          st.drawing = emptyDraft();
          st.selectedPolygonId = null;
          st.selectedShaderId = null;
        }
      }),

    mutateLocation: (fn) =>
      set((st) => {
        const loc = st.server?.locations.find((l) => l.id === st.server!.activeLocationId);
        if (loc) fn(loc);
      }),

    setMode: (mode) => set({ mode }),
    chooseSelectTool: () => set({ mode: 'select', drawing: emptyDraft() }),
    chooseDrawTool: () => set({ mode: 'draw', selectedPolygonId: null }),
    chooseGridAlignTool: () => set({ mode: 'grid-align' }),
    chooseShaderTool: (shaderId) => set({ mode: 'shader-place', selectedShaderType: shaderId, drawing: emptyDraft() }),
    finishTool: () => set({ mode: 'select' }),

    select: (patch) =>
      set((st) => {
        if (patch.polygon !== undefined) st.selectedPolygonId = patch.polygon;
        if (patch.shader !== undefined) st.selectedShaderId = patch.shader;
      }),

    addDrawPoint: (p) => set((st) => { st.drawing = addPoint(st.drawing, p); }),
    resetDrawing: () => set({ drawing: emptyDraft() }),

    recordHistory: (label, undo, redo) =>
      set((st) => { st.history = pushEntry(st.history, { label, undo, redo }); }),

    undoAction: () => {
      const s = get();
      if (s.mode === 'draw') {
        set((st) => { st.drawing = undoPoint(st.drawing); });
        return;
      }
      const { history, entry } = stepUndo(s.history);
      if (!entry) return;
      set((st) => { st.history = history; });
      entry.undo();
    },

    redoAction: () => {
      const s = get();
      if (s.mode === 'draw') {
        set((st) => { st.drawing = redoPoint(st.drawing); });
        return;
      }
      const { history, entry } = stepRedo(s.history);
      if (!entry) return;
      set((st) => { st.history = history; });
      entry.redo();
    },

    setGeometry: (g) => set({ geometry: g }),
    setEditorZoom: (z) => set({ editorZoom: z }),
    setFogOpacity: (v) => set({ fogOpacity: v }),
    toggleSquareConstrain: () => set((st) => { st.gridSquareConstrain = !st.gridSquareConstrain; }),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setUploadWarning: (msg) => set({ uploadWarning: msg }),
    resetForLocationChange: () => set({ selectedPolygonId: null, drawing: emptyDraft(), editorZoom: 1 }),
  }))
);
