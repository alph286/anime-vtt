import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Rect } from '@/types';
import type { Aoe, AoeShape, ControlLocation, ControlState } from '../types';
import {
  loadDmGridOpacity, loadDmGridVisible, saveDmGridOpacity, saveDmGridVisible,
} from '../lib/prefs';
import { loadLocalZoom, saveLocalZoom, type LocalZoom } from '../lib/local-zoom';

export type Mode = 'pan' | 'fog' | 'ping' | 'zoom' | 'aoe' | null;
export type TabId = 'mappa' | 'fog' | 'immagini';
export interface TelegramFeedback { imageId: string; ok: boolean; error?: string }
// previewW/H = dimensioni di #map-preview (spazio non zoomato), servono al
// riquadro giallo e al clamp dello zoom locale.
export interface Geometry {
  imageRect: Rect | null; rotation: number; naturalW: number; naturalH: number;
  previewW: number; previewH: number;
}

interface AoeDefaults {
  shape: AoeShape; color: string; size: number; width: number; shaderOverride: string | null;
}

interface ControlStore {
  server: ControlState | null;
  socketConnected: boolean;
  displayConnected: boolean;
  previewLocationId: string | null;
  previewImageId: string | null;
  mode: Mode;
  tab: TabId;
  fogOpacity: number; // solo di sessione
  dmGridOpacity: number; // persistito
  dmGridVisible: boolean; // persistito
  localZoom: LocalZoom; // persistito solo su azioni esplicite
  selectedAoeId: string | null;
  aoeShape: AoeShape;
  aoeColor: string;
  aoeSize: number;
  aoeWidth: number;
  aoeShaderOverride: string | null;
  aoeShaderMenuOpen: boolean;
  telegramPending: boolean;
  telegramFeedback: TelegramFeedback | null;
  geometry: Geometry;

  receiveState: (s: ControlState) => void;
  setConnected: (socket: boolean) => void;
  setDisplayConnected: (b: boolean) => void;
  setPreviewLocation: (id: string) => void;
  cancelPreview: () => void;
  setPreviewImage: (id: string | null) => void;
  setMode: (m: Exclude<Mode, null>) => void;
  forceMode: (m: Mode) => void;
  setTab: (t: TabId) => void;
  setFogOpacity: (v: number) => void;
  setDmGridOpacity: (v: number) => void;
  toggleDmGridVisible: () => void;
  setLocalZoom: (z: LocalZoom, opts?: { persist?: boolean }) => void;
  resetLocalZoom: () => void;
  selectAoe: (id: string | null) => void;
  patchAoeDefaults: (p: Partial<AoeDefaults>) => void;
  setShaderMenuOpen: (b: boolean) => void;
  setTelegram: (p: { pending?: boolean; feedback?: TelegramFeedback | null }) => void;
  setGeometry: (g: Geometry) => void;
}

type S = Pick<ControlStore, 'server' | 'previewLocationId' | 'selectedAoeId'>;

export const selectPreviewLocation = (s: S): ControlLocation | undefined =>
  s.server?.locations.find((l) => l.id === s.previewLocationId);
export const selectActiveLocation = (s: Pick<ControlStore, 'server'>): ControlLocation | undefined =>
  s.server?.locations.find((l) => l.id === s.server!.activeLocationId);
export const selectIsPreviewing = (s: S): boolean =>
  s.previewLocationId !== (s.server?.activeLocationId ?? null);
export const selectShowingImage = (s: Pick<ControlStore, 'server'>): boolean =>
  Boolean(s.server?.activeImageId);
// Il ping arriva ai giocatori solo se punta alla mappa che vedono davvero ora:
// niente anteprima di un'altra location, niente immagine al posto della mappa.
export const selectPingAvailable = (s: S): boolean =>
  !selectIsPreviewing(s) && !selectShowingImage(s) && Boolean(s.server?.activeLocationId);
// Stessa regola del ping, piu: senza file mappa non c'e nulla su cui disegnare.
export const selectAoeAvailable = (s: S): boolean =>
  selectPingAvailable(s) && Boolean(selectPreviewLocation(s)?.map.file);
export const selectSelectedAoe = (s: S): Aoe | undefined =>
  selectPreviewLocation(s)?.map.aoes?.find((a) => a.id === s.selectedAoeId);

function modeAllowed(m: Exclude<Mode, null>, s: S): boolean {
  if (m === 'ping') return selectPingAvailable(s);
  if (m === 'aoe') return selectAoeAvailable(s);
  return true;
}

const ZOOM_RESET: LocalZoom = { scale: 1, x: 0, y: 0 };

export const useControlStore = create<ControlStore>()(
  immer((set) => ({
    server: null,
    socketConnected: false,
    displayConnected: false,
    previewLocationId: null,
    previewImageId: null,
    mode: null,
    tab: 'mappa',
    fogOpacity: 0.45,
    dmGridOpacity: loadDmGridOpacity(),
    dmGridVisible: loadDmGridVisible(),
    localZoom: loadLocalZoom(),
    selectedAoeId: null,
    aoeShape: 'cone',
    aoeColor: 'red',
    aoeSize: AOE_METERS_PER_CELL,
    aoeWidth: AOE_METERS_PER_CELL,
    aoeShaderOverride: null,
    aoeShaderMenuOpen: false,
    telegramPending: false,
    telegramFeedback: null,
    geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },

    receiveState: (s) => set((d) => {
      d.server = s as never;
      // Anteprima assente, archiviata o cancellata: ripiega sulla attiva.
      if (!d.previewLocationId || !s.locations.some((l) => l.id === d.previewLocationId && !l.archived)) {
        d.previewLocationId = s.activeLocationId;
      }
      const active = s.locations.find((l) => l.id === s.activeLocationId);
      if (d.previewImageId && !(active?.images ?? []).some((i) => i.id === d.previewImageId)) {
        d.previewImageId = null;
      }
      const preview = s.locations.find((l) => l.id === d.previewLocationId);
      if (d.selectedAoeId && !(preview?.map.aoes ?? []).some((a) => a.id === d.selectedAoeId)) {
        d.selectedAoeId = null;
      }
      // Gating transitorio: ping/aoe non disponibili -> esce dalla modalita.
      if ((d.mode === 'ping' || d.mode === 'aoe') && !modeAllowed(d.mode, d as unknown as S)) {
        d.mode = null;
      }
    }),
    setConnected: (b) => set({ socketConnected: b }),
    setDisplayConnected: (b) => set({ displayConnected: b }),
    setPreviewLocation: (id) => set((d) => { d.previewLocationId = id; d.localZoom = { ...ZOOM_RESET }; }),
    cancelPreview: () => set((d) => {
      d.previewLocationId = d.server?.activeLocationId ?? null;
      d.localZoom = { ...ZOOM_RESET };
    }),
    setPreviewImage: (id) => set({ previewImageId: id }),
    setMode: (m) => set((d) => {
      if (!modeAllowed(m, d as unknown as S)) { d.mode = null; return; }
      const enteringPan = m === 'pan' && d.mode !== 'pan';
      d.mode = d.mode === m ? null : m;
      // Il riquadro giallo ha senso solo sulla mappa intera: zoom locale
      // azzerato (senza toccare lo storage).
      if (enteringPan && d.mode === 'pan') d.localZoom = { ...ZOOM_RESET };
    }),
    forceMode: (m) => set({ mode: m }),
    setTab: (t) => set({ tab: t }),
    setFogOpacity: (v) => set({ fogOpacity: v }),
    setDmGridOpacity: (v) => { saveDmGridOpacity(v); set({ dmGridOpacity: v }); },
    toggleDmGridVisible: () => set((d) => { d.dmGridVisible = !d.dmGridVisible; saveDmGridVisible(d.dmGridVisible); }),
    setLocalZoom: (z, opts) => {
      if (opts?.persist) saveLocalZoom(z);
      set({ localZoom: z });
    },
    resetLocalZoom: () => set({ localZoom: { ...ZOOM_RESET } }),
    selectAoe: (id) => set({ selectedAoeId: id }),
    patchAoeDefaults: (p) => set((d) => {
      if (p.shape !== undefined) d.aoeShape = p.shape;
      if (p.color !== undefined) d.aoeColor = p.color;
      if (p.size !== undefined) d.aoeSize = p.size;
      if (p.width !== undefined) d.aoeWidth = p.width;
      if (p.shaderOverride !== undefined) d.aoeShaderOverride = p.shaderOverride;
    }),
    setShaderMenuOpen: (b) => set({ aoeShaderMenuOpen: b }),
    setTelegram: (p) => set((d) => {
      if (p.pending !== undefined) d.telegramPending = p.pending;
      if (p.feedback !== undefined) d.telegramFeedback = p.feedback;
    }),
    setGeometry: (g) => set({ geometry: g }),
  })),
);
